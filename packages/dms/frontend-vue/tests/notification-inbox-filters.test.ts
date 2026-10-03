import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createI18n } from "vue-i18n";
import {
  DEFAULT_INBOX_FILTERS,
  INBOX_KEYS_MAX_CHARACTERS,
  type InboxApiFilter,
  buildInboxUrl,
  fromCategoryValue,
  hasActiveInboxFilters,
  inboxApiParams,
  isNarrowedInbox,
  matchMessageKeys,
  matchesInboxFilter,
  normalizeSearchText,
  readInboxFilters,
  toCategoryValue,
  writeInboxFilters,
} from "../layers/dms-layout/app/composables/notification/inboxFilters";
import type { UserNotification } from "../layers/dms-layout/app/composables/notification/useNotifications";

const MESSAGES = {
  en: {
    m: {
      login: {
        title: "New sign-in from {device}",
        description: "From IP {ip}.",
      },
      codes: {
        title: "New backup codes generated",
        description_one: "Your previous code no longer works.",
      },
      roles: { title: "{count} role changed | {count} roles changed" },
    },
  },
  fr: {
    m: {
      login: {
        title: "Nouvelle connexion depuis {device}",
        description: "Depuis l'IP {ip}.",
      },
      codes: { title: "Nouveaux codes de secours générés" },
      roles: { title: "Rôle modifié | Rôles modifiés" },
    },
  },
};
const KEYS = [
  "m.login.title",
  "m.login.description",
  "m.codes.title",
  "m.codes.description_one",
  "m.roles.title",
  "m.missing.title",
];

function translatorFor(locale: "en" | "fr") {
  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: MESSAGES,
  });
  const { t } = i18n.global;
  return (key: string) => [t(key, {}), t(key, {}, 2)];
}

const FILTER: InboxApiFilter = {
  q: "",
  keys: [],
  category: "",
  subject: "",
  status: "all",
};

function notification(overrides: Partial<UserNotification>): UserNotification {
  return {
    _id: "n1",
    userId: "u1",
    icon: "i-ph-bell",
    title: "$m.login.title",
    description: "$m.login.description",
    params: { device: "Firefox on Windows", ip: "127.0.0.1" },
    linkTo: null,
    isRead: false,
    categoryId: "system",
    subjectId: "security",
    createdAt: "2026-10-02T10:00:00.000Z",
    updatedAt: "2026-10-02T10:00:00.000Z",
    ...overrides,
  };
}

describe("inbox filters in the URL", () => {
  it("reads every filter, and falls back on malformed values", () => {
    expect(
      readInboxFilters({
        q: "  sign   in ",
        category: "system",
        subject: "security",
        status: "unread",
      }),
    ).toEqual({
      q: "sign in",
      category: "system",
      subject: "security",
      status: "unread",
    });
    expect(
      readInboxFilters({
        category: "$where",
        subject: "x",
        status: "archived",
      }),
    ).toEqual(DEFAULT_INBOX_FILTERS);
    expect(readInboxFilters({ subject: "security" }).subject).toBe("");
    expect(readInboxFilters({ q: ["first", "second"] }).q).toBe("first");
  });

  it("writes only what differs from the defaults and keeps other params", () => {
    const params = writeInboxFilters(new URLSearchParams("tab=2&q=old"), {
      q: "invoice",
      category: "",
      subject: "orphan",
      status: "all",
    });
    expect(params.toString()).toBe("tab=2&q=invoice");
  });

  it("builds the page URL a reload restores", () => {
    const filters = {
      q: "sign-in",
      category: "system",
      subject: "security",
      status: "read" as const,
    };
    const url = buildInboxUrl(
      { pathname: "/settings/user/notifications", search: "", hash: "#inbox" },
      filters,
    );
    expect(url).toBe(
      "/settings/user/notifications?q=sign-in&category=system&subject=security&status=read#inbox",
    );
    const query = Object.fromEntries(new URL(url, "http://x").searchParams);
    expect(readInboxFilters(query)).toEqual(filters);
    expect(
      buildInboxUrl(
        { pathname: "/p", search: "?q=x", hash: "" },
        DEFAULT_INBOX_FILTERS,
      ),
    ).toBe("/p");
  });
});

describe("inbox filter state", () => {
  it("tells a narrowed inbox from a read-state switch", () => {
    expect(isNarrowedInbox({ q: " ", category: "" })).toBe(false);
    expect(isNarrowedInbox({ q: "x", category: "" })).toBe(true);
    expect(
      hasActiveInboxFilters({ ...DEFAULT_INBOX_FILTERS, status: "read" }),
    ).toBe(true);
    expect(hasActiveInboxFilters(DEFAULT_INBOX_FILTERS)).toBe(false);
  });

  it("round-trips the category select value", () => {
    expect(toCategoryValue("", "")).toBe("all");
    expect(fromCategoryValue("all")).toEqual({ category: "", subject: "" });
    expect(fromCategoryValue(toCategoryValue("system", "security"))).toEqual({
      category: "system",
      subject: "security",
    });
    expect(fromCategoryValue("logistics")).toEqual({
      category: "logistics",
      subject: "",
    });
  });

  it("sends the read state to the list but not to the counts", () => {
    const filter = {
      ...FILTER,
      q: "sign",
      keys: ["m.login.title"],
      category: "system",
      status: "unread" as const,
    };
    expect(inboxApiParams(filter, true).toString()).toBe(
      "q=sign&keys=m.login.title&category=system&filter=unread",
    );
    expect(inboxApiParams(filter, false).toString()).toBe(
      "q=sign&keys=m.login.title&category=system",
    );
    expect(inboxApiParams({ ...FILTER, keys: ["m.x"] }, true).toString()).toBe(
      "",
    );
  });
});

describe("message keys matching the search", () => {
  it("matches what the user reads, placeholders left out", () => {
    const translate = translatorFor("en");
    expect(matchMessageKeys(KEYS, translate, "SIGN-IN")).toEqual([
      "m.login.title",
    ]);
    expect(matchMessageKeys(KEYS, translate, "from ip")).toEqual([
      "m.login.description",
    ]);
    // `{device}` is a param: the server matches its value instead.
    expect(matchMessageKeys(KEYS, translate, "device")).toEqual([]);
  });

  it("reads plural variants and every plural choice", () => {
    const translate = translatorFor("en");
    expect(matchMessageKeys(KEYS, translate, "previous code")).toEqual([
      "m.codes.description_one",
    ]);
    expect(matchMessageKeys(KEYS, translate, "roles changed")).toEqual([
      "m.roles.title",
    ]);
  });

  it("follows the active locale, accents aside, with its fallback", () => {
    const translate = translatorFor("fr");
    expect(matchMessageKeys(KEYS, translate, "connexion")).toEqual([
      "m.login.title",
    ]);
    expect(matchMessageKeys(KEYS, translate, "generes")).toEqual([
      "m.codes.title",
    ]);
    // Missing in French: the English fallback is what the user reads.
    expect(matchMessageKeys(KEYS, translate, "previous code")).toEqual([
      "m.codes.description_one",
    ]);
    expect(matchMessageKeys(KEYS, translate, "sign-in")).toEqual([]);
  });

  it("skips untranslated keys and an empty search", () => {
    const translate = translatorFor("en");
    expect(matchMessageKeys(KEYS, translate, "missing")).toEqual([]);
    expect(matchMessageKeys(KEYS, translate, "   ")).toEqual([]);
  });

  it("stays within the request budget", () => {
    const keys = Array.from({ length: 400 }, (_, index) => `k.${index}.title`);
    const matched = matchMessageKeys(keys, () => ["Same text"], "same");
    const characters = matched.join(",").length;
    expect(matched.length).toBeLessThanOrEqual(200);
    expect(characters).toBeLessThanOrEqual(INBOX_KEYS_MAX_CHARACTERS);
  });

  it("normalizes case, accents and spaces", () => {
    expect(normalizeSearchText("  Sécurité   Élevée ")).toBe("securite elevee");
  });
});

describe("matching a live notification against the filter", () => {
  it("mirrors the server: raw text, matched keys and param values", () => {
    const keyed = notification({});
    expect(matchesInboxFilter(keyed, { ...FILTER, q: "firefox" }, true)).toBe(
      true,
    );
    expect(
      matchesInboxFilter(
        keyed,
        { ...FILTER, q: "sign", keys: ["m.login.title"] },
        true,
      ),
    ).toBe(true);
    // The stored key itself is not what the user reads.
    expect(matchesInboxFilter(keyed, { ...FILTER, q: "login" }, true)).toBe(
      false,
    );
    const raw = notification({
      title: "Weekly report ready",
      description: "",
      params: null,
    });
    expect(matchesInboxFilter(raw, { ...FILTER, q: "WEEKLY" }, true)).toBe(
      true,
    );
  });

  it("checks the category, the subject and, on request, the read state", () => {
    const item = notification({ isRead: true });
    expect(
      matchesInboxFilter(item, { ...FILTER, category: "logistics" }, true),
    ).toBe(false);
    expect(
      matchesInboxFilter(
        item,
        { ...FILTER, category: "system", subject: "account" },
        true,
      ),
    ).toBe(false);
    expect(
      matchesInboxFilter(item, { ...FILTER, status: "unread" }, true),
    ).toBe(false);
    expect(
      matchesInboxFilter(item, { ...FILTER, status: "unread" }, false),
    ).toBe(true);
  });
});

describe("useNotifications with an inbox filter", () => {
  const authFetch = vi.fn();
  const sendComponentEvent = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    authFetch.mockReset();
    sendComponentEvent.mockReset();
    vi.stubGlobal("useDmsState", <T>(_key: string, init: () => T) =>
      ref(init()),
    );
    vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
    vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function load() {
    const module = await import(
      "../layers/dms-layout/app/composables/notification/useNotifications"
    );
    return module.useNotifications();
  }

  it("lists and counts the filtered feed, and keeps the bell on the whole feed", async () => {
    authFetch.mockImplementation(async (url: string) => {
      if (url.includes("/list")) return [notification({})];
      if (url.includes("/unread-count")) return { count: 12 };
      return { all: 3, unread: 1 };
    });
    const state = await load();
    await state.setInboxFilter({
      ...FILTER,
      q: "firefox",
      category: "system",
      status: "unread",
    });

    const urls = authFetch.mock.calls.map(([url]) => url as string);
    expect(urls).toContain(
      "/settings/user/notifications/list?q=firefox&category=system&filter=unread&limit=20&offset=0",
    );
    expect(urls).toContain(
      "/settings/user/notifications/counts?q=firefox&category=system",
    );
    expect(state.inboxCounts.value).toEqual({ all: 3, unread: 1 });
    expect(state.unreadCount.value).toBe(12);
  });

  it("counts a live notification everywhere but lists it only when it matches", async () => {
    authFetch.mockResolvedValue([]);
    const state = await load();
    state.inboxFilter.value = { ...FILTER, category: "system" };
    state.inboxCounts.value = { all: 5, unread: 2 };

    state.handleIncomingNotification(
      notification({ _id: "other", categoryId: "logistics" }),
    );
    expect(state.inboxItems.value).toHaveLength(0);
    expect(state.inboxCounts.value).toEqual({ all: 5, unread: 2 });
    expect(state.unreadCount.value).toBe(1);

    state.inboxFilter.value = { ...FILTER, category: "system", status: "read" };
    state.handleIncomingNotification(notification({ _id: "unread-one" }));
    expect(state.inboxItems.value).toHaveLength(0);
    expect(state.inboxCounts.value).toEqual({ all: 6, unread: 3 });

    state.inboxFilter.value = { ...FILTER, category: "system" };
    state.handleIncomingNotification(notification({ _id: "match" }));
    expect(state.inboxItems.value.map((n) => n._id)).toEqual(["match"]);
    expect(state.unreadCount.value).toBe(3);
  });

  it("adds what a live notification brings to the facets", async () => {
    const state = await load();
    state.handleIncomingNotification(
      notification({ _id: "new", categoryId: "logistics", subjectId: "ship" }),
    );
    expect(state.inboxFacets.value.messageKeys).toEqual([
      "m.login.title",
      "m.login.description",
    ]);
    expect(state.inboxFacets.value.subjects).toEqual([
      { categoryId: "logistics", subjectId: "ship" },
    ]);
  });

  it("scopes mark all as read to the filter, and only marks what it changed", async () => {
    const state = await load();
    state.inboxItems.value = [
      notification({ _id: "a" }),
      notification({ _id: "b", categoryId: "logistics" }),
    ];
    authFetch.mockImplementation(async (url: string) => {
      if (url.includes("/mark-all-read")) return { success: true, ids: ["a"] };
      return { all: 1, unread: 0 };
    });

    const ids = await state.markAllAsRead({ ...FILTER, category: "system" });

    expect(ids).toEqual(["a"]);
    expect(authFetch.mock.calls[0]?.[0]).toBe(
      "/settings/user/notifications/mark-all-read?category=system",
    );
    expect(state.inboxItems.value.map((n) => n.isRead)).toEqual([true, false]);
  });

  it("keeps the unscoped bulk actions on the whole feed", async () => {
    const state = await load();
    authFetch.mockResolvedValue({ success: true, ids: [] });
    await state.markAllAsRead();
    await state.deleteAll();
    const urls = authFetch.mock.calls.map(([url]) => url as string);
    expect(urls).toContain("/settings/user/notifications/mark-all-read");
    expect(urls).toContain("/settings/user/notifications/delete-all");
  });
});
