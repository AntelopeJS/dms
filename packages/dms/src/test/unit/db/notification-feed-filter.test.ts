import { ValueProxy } from "@antelopejs/interface-database";
import { expect } from "chai";
import {
  FEED_SEARCH_MAX_KEYS,
  FEED_SEARCH_MAX_LENGTH,
  applyFeedFilter,
  paramValuePattern,
  escapeRegex,
  isFilteredFeed,
  isNarrowedFeed,
  messageKeysPattern,
  parseNotificationFeedQuery,
  rawTextPattern,
} from "../../../db/models/notification-feed-filter";
import type { UserNotification } from "../../../db/tables";

const INLINE_CASE_FLAG = "(?i)";

/** The database reads `(?i)` as the case-insensitive flag; JavaScript takes it as a flag. */
function toRegExp(pattern: string): RegExp {
  return pattern.startsWith(INLINE_CASE_FLAG)
    ? new RegExp(pattern.slice(INLINE_CASE_FLAG.length), "i")
    : new RegExp(pattern);
}

type Predicate = (row: ValueProxy<UserNotification>) => unknown;

/** Records the predicates a filter adds, the way a feed query chains them. */
class RecordingFeed {
  readonly predicates: Predicate[] = [];

  filter(predicate: Predicate): RecordingFeed {
    this.predicates.push(predicate);
    return this;
  }
}

function stagesOf(predicate: Predicate): string {
  const result = predicate(ValueProxy.arg<UserNotification>(0));
  return JSON.stringify((result as ValueProxy<boolean>).build());
}

describe("[unit] db/notification-feed-filter", () => {
  describe("parseNotificationFeedQuery", () => {
    it("reads no parameter as the whole feed", () => {
      const filter = parseNotificationFeedQuery({});
      expect(filter).to.deep.equal({});
      expect(isFilteredFeed(filter!)).to.equal(false);
    });

    it("keeps the read state, and reads the older `all` as none", () => {
      expect(parseNotificationFeedQuery({ filter: "unread" })).to.deep.equal({
        readState: "unread",
      });
      expect(parseNotificationFeedQuery({ filter: "read" })).to.deep.equal({
        readState: "read",
      });
      expect(parseNotificationFeedQuery({ filter: "all" })).to.deep.equal({});
      expect(parseNotificationFeedQuery({ filter: "archived" })).to.equal(
        undefined,
      );
    });

    it("needs the category of a subject", () => {
      expect(
        parseNotificationFeedQuery({ category: "system", subject: "security" }),
      ).to.deep.equal({ categoryId: "system", subjectId: "security" });
      expect(parseNotificationFeedQuery({ subject: "security" })).to.equal(
        undefined,
      );
    });

    it("refuses an id the database would read as a field reference", () => {
      expect(parseNotificationFeedQuery({ category: "$where" })).to.equal(
        undefined,
      );
    });

    it("collapses the search's whitespace and keeps its keys, deduplicated", () => {
      const filter = parseNotificationFeedQuery({
        q: "  new   sign-in ",
        keys: "dms.a.title, dms.b.description,dms.a.title",
      });
      expect(filter?.search).to.deep.equal({
        text: "new sign-in",
        keys: ["dms.a.title", "dms.b.description"],
      });
      expect(isNarrowedFeed(filter!)).to.equal(true);
    });

    it("ignores keys without a search", () => {
      expect(parseNotificationFeedQuery({ keys: "dms.a.title" })).to.deep.equal(
        {},
      );
    });

    it("caps the search length and the number of keys", () => {
      expect(
        parseNotificationFeedQuery({ q: "x".repeat(FEED_SEARCH_MAX_LENGTH) }),
      ).to.not.equal(undefined);
      expect(
        parseNotificationFeedQuery({
          q: "x".repeat(FEED_SEARCH_MAX_LENGTH + 1),
        }),
      ).to.equal(undefined);
      const keys = Array.from(
        { length: FEED_SEARCH_MAX_KEYS + 1 },
        (_, index) => `k${index}`,
      );
      expect(
        parseNotificationFeedQuery({ q: "x", keys: keys.join(",") }),
      ).to.equal(undefined);
    });

    it("refuses a key that is not a message key", () => {
      expect(
        parseNotificationFeedQuery({ q: "x", keys: "dms.a.title|.*" }),
      ).to.equal(undefined);
    });
  });

  describe("patterns", () => {
    it("escapes every regex character of the search", () => {
      const tricky = "a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o/p-q";
      expect(toRegExp(escapeRegex(tricky)).test(tricky)).to.equal(true);
      expect(toRegExp(escapeRegex("a.b")).test("axb")).to.equal(false);
    });

    it("matches raw text case-insensitively, never a stored message key", () => {
      const pattern = toRegExp(rawTextPattern("WEEKLY report"));
      expect(pattern.test("Your weekly report is ready")).to.equal(true);
      expect(pattern.test("Line one\nweekly report")).to.equal(true);
      expect(toRegExp(rawTextPattern("dms")).test("$dms.x.title")).to.equal(
        false,
      );
    });

    it("matches a param value anywhere in it", () => {
      expect(
        toRegExp(paramValuePattern("ALICE")).test("alice@example.com"),
      ).to.equal(true);
      expect(toRegExp(paramValuePattern("10")).test("10")).to.equal(true);
    });

    it("skips param values no one reads: ids and time stamps", () => {
      expect(
        toRegExp(paramValuePattern("3ef8")).test(
          "3ef88b0e-47cb-4704-97f9-92c098544a5d",
        ),
      ).to.equal(false);
      expect(toRegExp(paramValuePattern("97")).test("1790970893027")).to.equal(
        false,
      );
    });

    it("matches only the listed message keys, whole", () => {
      const pattern = toRegExp(
        messageKeysPattern(["dms.a.title", "dms.b.description"]),
      );
      expect(pattern.test("$dms.a.title")).to.equal(true);
      expect(pattern.test("$dms.b.description")).to.equal(true);
      expect(pattern.test("$dms.a.title.extra")).to.equal(false);
      expect(pattern.test("dms.a.title")).to.equal(false);
      expect(pattern.test("$dmsXa.title")).to.equal(false);
    });

    it("never starts with `$`, which the database reads as a field", () => {
      for (const pattern of [
        rawTextPattern("$x"),
        paramValuePattern("$x"),
        messageKeysPattern(["a"]),
      ]) {
        expect(pattern.startsWith("$")).to.equal(false);
      }
    });
  });

  describe("applyFeedFilter", () => {
    it("adds nothing for the whole feed", () => {
      const feed = new RecordingFeed();
      applyFeedFilter(feed, {});
      expect(feed.predicates).to.have.length(0);
    });

    it("adds one condition per narrowing", () => {
      const feed = new RecordingFeed();
      applyFeedFilter(feed, {
        readState: "read",
        categoryId: "system",
        subjectId: "security",
        search: { text: "sign-in", keys: ["dms.a.title"] },
      });
      expect(feed.predicates).to.have.length(4);
      const [readState, category, subject, search] =
        feed.predicates.map(stagesOf);
      expect(readState).to.contain('"isRead"').and.to.contain("true");
      expect(category).to.contain('"system"');
      expect(subject).to.contain('"security"');
      expect(search)
        .to.contain(JSON.stringify(rawTextPattern("sign-in")))
        .and.to.contain(JSON.stringify(messageKeysPattern(["dms.a.title"])))
        .and.to.contain('"params"');
    });

    it("leaves the key match out when no translation matched", () => {
      const feed = new RecordingFeed();
      applyFeedFilter(feed, { search: { text: "alice", keys: [] } });
      expect(stagesOf(feed.predicates[0]!)).to.not.contain("^[$](?:");
    });
  });
});
