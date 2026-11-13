import { chmod, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import {
  createAnnotation,
  listAnnotations,
  type MockupEvent,
  type MockupName,
  MOCKUP_SOURCES,
  mockupNameSchema,
  MockupStore,
  parseMockupName,
  specSchema,
  updateAnnotation,
  WATCH_DEBOUNCE_MS,
} from "../../../mockup";

const NAME = mockupNameSchema.parse("desk");
const SAVE_TO_STATE_BUDGET_MS = 1000;
const CONCURRENT_CREATES = 25;

function specObject(title: string) {
  return {
    version: 1,
    pages: [
      {
        id: "home",
        title,
        tree: [{ type: "KpiCard", options: { title, staticValue: 1 } }],
      },
    ],
  };
}

function spec(title: string): string {
  return JSON.stringify(specObject(title));
}

/** A subscription waiting for one event: `ready` once subscribed, with what ends it. */
interface PendingEvent {
  ready: Promise<() => void>;
  event: Promise<MockupEvent>;
}

/** Resolves with the first event `store` sends for `name` that `accept` takes. */
function nextEvent(
  store: MockupStore,
  name: MockupName,
  accept: (event: MockupEvent) => boolean,
): PendingEvent {
  let resolve: (event: MockupEvent) => void = () => {};
  const event = new Promise<MockupEvent>((settle) => {
    resolve = settle;
  });
  let initial = true;
  const ready = store
    .subscribe(name, (received) => {
      if (initial) {
        initial = false;
        return;
      }
      if (accept(received)) resolve(received);
    })
    .then((unsubscribe) => {
      if (!unsubscribe) throw new Error("the mockup does not exist");
      return unsubscribe;
    });
  return { ready, event };
}

describe("[unit] mockup store", () => {
  let root: string;
  let store: MockupStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dms-mockups-"));
    await mkdir(join(root, NAME));
    await writeFile(join(root, NAME, "spec.json"), spec("First"));
    store = new MockupStore(root);
  });

  afterEach(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });

  it("keeps the last good pages when spec.json stops being JSON", async () => {
    const good = await store.state(NAME);
    await writeFile(
      join(root, NAME, "spec.json"),
      '{ "version": 1, "pages": [',
    );
    const broken = await store.state(NAME);

    expect(broken?.pages).to.deep.equal(good?.pages);
    expect(broken?.pages[0].title).to.equal("First");
    expect(broken?.issues).to.have.length(1);
    expect(broken?.issues[0].path).to.equal("");
    expect(broken?.revision).to.equal((good?.revision ?? 0) + 1);
  });

  it("follows a mockup whatever an unreadable sibling directory holds", async () => {
    const locked = join(root, "locked");
    await mkdir(locked);
    await chmod(locked, 0);
    try {
      const { ready, event } = nextEvent(
        store,
        NAME,
        (received) =>
          received.event === "state" &&
          received.data.pages[0]?.title === "Beside",
      );
      const unsubscribe = await ready;
      await writeFile(join(root, NAME, "spec.json"), spec("Beside"));
      const received = await event;
      unsubscribe();

      expect(received.event).to.equal("state");
    } finally {
      await chmod(locked, 0o700);
    }
  });

  it("keeps following a mockup whose directory is deleted and made again", async () => {
    const { ready, event } = nextEvent(
      store,
      NAME,
      (received) =>
        received.event === "state" && received.data.pages[0]?.title === "Again",
    );
    const unsubscribe = await ready;
    await rm(join(root, NAME), { recursive: true });
    await mkdir(join(root, NAME));
    await writeFile(join(root, NAME, "spec.json"), spec("Again"));
    const received = await event;
    const current = await store.state(NAME);
    unsubscribe();

    expect(received.event).to.equal("state");
    expect(current?.pages[0].title).to.equal("Again");
  });

  it("sends a subscriber the new state within a second of a save", async () => {
    const { ready, event } = nextEvent(
      store,
      NAME,
      (received) =>
        received.event === "state" &&
        received.data.pages[0]?.title === "Second",
    );
    const unsubscribe = await ready;
    const saved = Date.now();
    await writeFile(join(root, NAME, "spec.json"), spec("Second"));
    const received = await event;
    const elapsed = Date.now() - saved;
    unsubscribe();

    expect(received.event).to.equal("state");
    expect(elapsed).to.be.below(SAVE_TO_STATE_BUDGET_MS);
    expect(elapsed).to.be.at.least(WATCH_DEBOUNCE_MS);
  });

  it("lists only directories with a spec, under a valid name", async () => {
    await mkdir(join(root, "no-spec"));
    await mkdir(join(root, "Bad Name"));
    await writeFile(join(root, "Bad Name", "spec.json"), spec("Hidden"));

    const listed = await store.list();

    expect(listed.map((summary) => summary.name)).to.deep.equal([NAME]);
    expect(listed[0]).to.deep.include({
      pages: 1,
      openComments: 0,
      status: "draft",
    });
  });

  it("lists the mockup changed last first, and by name when changed together", async () => {
    const at = (iso: string) => new Date(iso);
    const write = async (name: string, changed: Date) => {
      await mkdir(join(root, name), { recursive: true });
      const file = join(root, name, "spec.json");
      await writeFile(file, spec(name));
      await utimes(file, changed, changed);
    };
    await write("old", at("2026-01-01T00:00:00Z"));
    await write("new", at("2026-03-01T00:00:00Z"));
    await write("tie-b", at("2026-02-01T00:00:00Z"));
    await write("tie-a", at("2026-02-01T00:00:00Z"));
    await utimes(
      join(root, NAME, "spec.json"),
      at("2025-12-01T00:00:00Z"),
      at("2025-12-01T00:00:00Z"),
    );

    const listed = await store.list();

    expect(listed.map((summary) => summary.name)).to.deep.equal([
      "new",
      "tie-a",
      "tie-b",
      "old",
      NAME,
    ]);
    expect(listed[0].updatedAt).to.equal("2026-03-01T00:00:00.000Z");
  });

  it("counts the open annotations of a mockup, never the resolved ones", async () => {
    const draft = { page: "home", path: "/pages/0/tree/0" };
    const first = await createAnnotation(NAME, { ...draft, text: "a" }, root);
    if (!first) throw new Error("the mockup does not exist");
    await createAnnotation(NAME, { ...draft, text: "b" }, root);
    await createAnnotation(NAME, { ...draft, text: "c" }, root);
    await updateAnnotation(NAME, first.id, { status: "resolved" }, root);
    await mkdir(join(root, "quiet"));
    await writeFile(join(root, "quiet", "spec.json"), spec("Quiet"));

    const counts = Object.fromEntries(
      (await store.list()).map((summary) => [
        summary.name,
        summary.openComments,
      ]),
    );

    expect(counts).to.deep.equal({ [NAME]: 2, quiet: 0 });
  });

  it("still lists a mockup whose annotations file is not readable", async () => {
    await writeFile(join(root, NAME, "annotations.json"), "{ not json");

    const listed = await store.list();

    expect(listed).to.have.length(1);
    expect(listed[0].openComments).to.equal(0);
  });

  /**
   * Fails a store that keeps a blank title (an unlabelled link on the card),
   * or a spec reader that refuses a build time with a UTC offset, which the
   * JSON Schema's `date-time` allows.
   */
  it("lists the source and the built pages a spec writes, a page titled by its path when its title is absent or blank", async () => {
    await writeFile(
      join(root, NAME, "spec.json"),
      JSON.stringify({
        ...specObject("Built"),
        source: "claude-code",
        built: {
          at: "2026-11-13T12:00:00+02:00",
          pages: [
            { path: "/orders", title: "Orders" },
            { path: "/orders/new" },
            { path: "/stock", title: "   " },
          ],
        },
      }),
    );

    const [summary] = await store.list();

    expect(summary).to.not.have.property("title");
    expect(summary).to.deep.include({
      name: NAME,
      source: "claude-code",
      status: "built",
      builtAt: "2026-11-13T12:00:00+02:00",
    });
    expect(summary).to.have.deep.property("builtPages", [
      { path: "/orders", title: "Orders" },
      { path: "/orders/new", title: "/orders/new" },
      { path: "/stock", title: "/stock" },
    ]);
  });

  it("lists a spec as a draft when its built or its source is invalid, keeping what reads cleanly", async () => {
    const bad = [
      { path: "//evil.com" },
      { path: "/\\evil.com" },
      { path: "javascript:alert(1)" },
      { path: "/has space" },
      { path: "https://evil.com/x" },
    ];
    const names: string[] = [];
    for (const [index, page] of bad.entries()) {
      const name = `bad-${index}`;
      names.push(name);
      await mkdir(join(root, name));
      await writeFile(
        join(root, name, "spec.json"),
        JSON.stringify({
          ...specObject("Bad"),
          source: "somebody",
          built: { at: "2026-11-13T10:00:00Z", pages: [page] },
        }),
      );
    }

    const listed = (await store.list()).filter((summary) =>
      names.includes(summary.name),
    );

    expect(listed).to.have.length(bad.length);
    for (const summary of listed) {
      expect(summary).to.deep.include({ status: "draft", pages: 1 });
      expect(summary).to.not.have.property("source");
      expect(summary).to.not.have.property("builtPages");
    }
  });

  it("lists a spec that is not JSON as a draft of no pages", async () => {
    await writeFile(
      join(root, NAME, "spec.json"),
      '{ "version": 1, "pages": [',
    );

    expect(await store.list()).to.have.length(1);
    expect((await store.list())[0]).to.deep.include({
      pages: 0,
      status: "draft",
    });
  });

  it("refuses, in the spec, a built page whose path is not one of the dashboard", () => {
    const written = (path: string) =>
      specSchema.safeParse({
        ...specObject("Built"),
        built: { at: "2026-11-13T10:00:00Z", pages: [{ path }] },
      }).success;

    expect(written("//evil.com")).to.equal(false);
    expect(written("/\\evil.com")).to.equal(false);
    expect(written("javascript:x")).to.equal(false);
    expect(written("https://evil.com")).to.equal(false);
    expect(written("/a b")).to.equal(false);
    expect(written("")).to.equal(false);
    expect(written("/orders?tab=open#top")).to.equal(true);
    expect(
      specSchema.safeParse({
        ...specObject("Built"),
        built: { at: "2026-11-13T10:00:00Z", pages: [] },
      }).success,
    ).to.equal(false);
    expect(
      specSchema.safeParse({
        ...specObject("Built"),
        built: { at: "yesterday", pages: [{ path: "/a" }] },
      }).success,
    ).to.equal(false);
  });

  it("accepts the source and the built a spec writes, and refuses a source nobody is", () => {
    const base = specObject("Built");

    for (const source of MOCKUP_SOURCES) {
      expect(specSchema.safeParse({ ...base, source }).success).to.equal(true);
    }
    expect(
      specSchema.safeParse({ ...base, source: "gemini" }).success,
    ).to.equal(false);
  });

  it("refuses a name that would leave the mockups directory", () => {
    expect(parseMockupName("..")).to.equal(undefined);
    expect(parseMockupName("../desk")).to.equal(undefined);
    expect(parseMockupName("desk/../..")).to.equal(undefined);
    expect(parseMockupName("%2e%2e")).to.equal(undefined);
    expect(parseMockupName("desk")).to.equal(NAME);
  });

  it("refuses a name the static schema route answers in its place", () => {
    expect(parseMockupName("schema")).to.equal(undefined);
    expect(parseMockupName("schemas")).to.equal("schemas");
  });

  it("round-trips annotations and keeps every one of concurrent creates", async () => {
    const created = await Promise.all(
      Array.from({ length: CONCURRENT_CREATES }, (_, index) =>
        createAnnotation(
          NAME,
          { page: "home", path: "/pages/0/tree/0", text: `note ${index}` },
          root,
        ),
      ),
    );
    const first = created[0];
    if (!first) throw new Error("the mockup does not exist");
    const resolved = await updateAnnotation(
      NAME,
      first.id,
      { status: "resolved" },
      root,
    );
    const reopened = await updateAnnotation(
      NAME,
      first.id,
      { status: "open", text: "again" },
      root,
    );
    const listed = (await listAnnotations(NAME, root)) ?? [];

    expect(new Set(listed.map((annotation) => annotation.id)).size).to.equal(
      CONCURRENT_CREATES,
    );
    expect(listed.map((annotation) => annotation.text).sort()).to.have.members([
      "again",
      ...Array.from(
        { length: CONCURRENT_CREATES - 1 },
        (_, index) => `note ${index + 1}`,
      ),
    ]);
    expect(resolved?.status).to.equal("resolved");
    expect(resolved?.resolvedAt).to.be.a("string");
    expect(reopened).to.not.have.property("resolvedAt");
    expect(listed[0]).to.deep.equal(reopened);
  });

  it("answers nothing for the annotations of a mockup that does not exist", async () => {
    const missing = mockupNameSchema.parse("missing");

    expect(await listAnnotations(missing, root)).to.equal(undefined);
    expect(
      await createAnnotation(
        missing,
        { page: "home", path: "", text: "x" },
        root,
      ),
    ).to.equal(undefined);
  });
});
