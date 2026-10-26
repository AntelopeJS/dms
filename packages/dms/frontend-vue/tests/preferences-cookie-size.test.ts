/** @vitest-environment jsdom */
import {
  computed,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  readonly,
  ref,
  toRaw,
  watch,
  type Ref,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PREFERENCES_COOKIE_BYTES,
  usePreferences,
} from "../layers/dms-core/app/composables/user/usePreferences";
import {
  decodePreferencesTree,
  preferencesCookieBytes,
} from "../layers/dms-core/app/build/composables/user/preferencesCookie";
import {
  LOCAL_TABLE_KEY_PREFIX,
  tablePreferenceId,
} from "../layers/dms-core/app/build/composables/user/tablePreferences";
import { useTablePreferences } from "../layers/dms-ui/app/build/composables/table-view/useTablePreferences";

const COMPONENT_ID = "content-child-main-child-main-child-languages";
const PAGE_ID = "modules.lang.manage.workspace";
const SORTED_ONLY_MAX_BYTES = 50;
const TYPICAL_MAX_BYTES = 150;
const TYPICAL_TABLES = 20;
const VISITED_TABLES = 80;
const DEFAULT_PAGINATION = { pageIndex: 0, pageSize: 10 };
const DEFAULT_SORT = [{ id: "createdAt", desc: true }];
const DEFAULT_VISIBILITY = { name: true, email: true, phone: true };

let stored: Ref<string>;
let writes: number[];

const installCookie = (initial: string) => {
  stored = ref(initial);
  writes = [];
  const cookie = computed({
    get: () => stored.value,
    set: (next) => {
      writes.push(preferencesCookieBytes(toRaw(next)));
      stored.value = next;
    },
  });
  vi.stubGlobal("useDmsCookie", () => cookie);
};

const cookieBytes = () => preferencesCookieBytes(stored.value);
const storedTree = () => decodePreferencesTree(stored.value);

const sortByName = (componentId: string, pageId: string) =>
  useTablePreferences(componentId, pageId).set(
    "sorting",
    [{ id: "name", desc: true }],
    DEFAULT_SORT,
  );

const visitTypicalTable = (componentId: string, pageId: string) => {
  const table = useTablePreferences(componentId, pageId);
  table.set("sorting", [{ id: "name", desc: true }], DEFAULT_SORT);
  table.set(
    "columnFilters",
    [{ accessorKey: "status", mode: "is", value: "active" }],
    [],
  );
  table.set("pagination", { pageIndex: 0, pageSize: 50 }, DEFAULT_PAGINATION);
  table.set(
    "columnVisibility",
    { name: true, email: false, phone: false },
    DEFAULT_VISIBILITY,
  );
};

const tableIds = (index: number): [string, string] => [
  `${COMPONENT_ID}-${index}`,
  `${PAGE_ID}.${index}`,
];

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("readonly", readonly);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("usePreferences", usePreferences);
  installCookie("");
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the size of a table's state in the preferences cookie", () => {
  it("is at most 50 bytes for a table only sorted", () => {
    const empty = preferencesCookieBytes("");
    sortByName(COMPONENT_ID, PAGE_ID);
    expect(cookieBytes() - empty).toBeLessThanOrEqual(SORTED_ONLY_MAX_BYTES);
  });

  it("is at most 150 bytes for a sorted, filtered, paged table with hidden columns", () => {
    sortByName("another-table", "another.page");
    const before = cookieBytes();
    visitTypicalTable(COMPONENT_ID, PAGE_ID);
    expect(cookieBytes() - before).toBeLessThanOrEqual(TYPICAL_MAX_BYTES);
  });

  it("keeps at least 20 typical tables", () => {
    for (let index = 0; index < TYPICAL_TABLES; index += 1) {
      visitTypicalTable(...tableIds(index));
    }
    expect(cookieBytes()).toBeLessThanOrEqual(MAX_PREFERENCES_COOKIE_BYTES);
    const tables = storedTree().tables as Record<string, unknown>;
    expect(Object.keys(tables)).toHaveLength(TYPICAL_TABLES);
    expect(
      useTablePreferences(...tableIds(0)).get("sorting", DEFAULT_SORT),
    ).toEqual([{ id: "name", desc: true }]);
  });
});

describe("a table's state in the preferences cookie", () => {
  it("is read back in its own shape", () => {
    visitTypicalTable(COMPONENT_ID, PAGE_ID);
    const table = useTablePreferences(COMPONENT_ID, PAGE_ID);
    expect(table.get("columnFilters", [])).toEqual([
      { accessorKey: "status", mode: "is", value: "active" },
    ]);
    expect(table.get("pagination", DEFAULT_PAGINATION)).toEqual({
      pageIndex: 0,
      pageSize: 50,
    });
    expect(table.get("columnVisibility", DEFAULT_VISIBILITY)).toEqual({
      name: true,
      email: false,
      phone: false,
    });
  });

  it("does not write a value equal to its default, and forgets one back to it", () => {
    const table = useTablePreferences(COMPONENT_ID, PAGE_ID);
    table.set("sorting", DEFAULT_SORT, DEFAULT_SORT);
    table.set("pagination", DEFAULT_PAGINATION, DEFAULT_PAGINATION);
    table.set("columnVisibility", DEFAULT_VISIBILITY, DEFAULT_VISIBILITY);
    expect(stored.value).toBe("");

    table.set("sorting", [{ id: "name", desc: false }], DEFAULT_SORT);
    expect(stored.value).not.toBe("");
    table.set("sorting", DEFAULT_SORT, DEFAULT_SORT);
    expect(storedTree()).toEqual({});
  });

  it("keeps a pinned filter on its declared value out of the cookie", () => {
    useTablePreferences(COMPONENT_ID, PAGE_ID).set(
      "columnFilters",
      [
        {
          accessorKey: "status",
          mode: "is",
          value: "open",
          pinned: true,
          initialValue: "open",
        },
      ],
      [],
    );
    expect(stored.value).toBe("");
  });

  it("lives under one short key, a dotted page id no longer nesting", () => {
    sortByName(COMPONENT_ID, PAGE_ID);
    const id = tablePreferenceId(COMPONENT_ID, PAGE_ID);
    expect(id).toMatch(/^[0-9a-z]{8}$/);
    expect(storedTree()).toEqual({ tables: { [id]: { s: "-name" } } });
  });

  it("keeps the browser-only state out of the cookie, in localStorage", () => {
    const table = useTablePreferences(COMPONENT_ID, PAGE_ID);
    table.set("columnOrder", ["email", "name"], []);
    table.set("columnSizing", { name: 240 }, {});
    table.set("density", "compact", "default");
    expect(stored.value).toBe("");
    const key = `${LOCAL_TABLE_KEY_PREFIX}${tablePreferenceId(COMPONENT_ID, PAGE_ID)}`;
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({
      columnOrder: ["email", "name"],
      columnSizing: { name: 240 },
      density: "compact",
    });

    table.set("density", "default", "default");
    table.set("columnOrder", [], []);
    table.set("columnSizing", {}, {});
    expect(localStorage.getItem(key)).toBeNull();
  });
});

describe("the browser-only state of a table", () => {
  const Density = defineComponent({
    setup() {
      const table = useTablePreferences(COMPONENT_ID, PAGE_ID);
      const density = ref("default");
      table.restore("density", density);
      return () => h("span", density.value);
    },
  });

  it("is restored once mounted, the server render hydrating as is", async () => {
    useTablePreferences(COMPONENT_ID, PAGE_ID).set(
      "density",
      "compact",
      "default",
    );
    const html = await renderToString(createSSRApp(Density));
    expect(html).toBe("<span>default</span>");

    const container = document.createElement("div");
    container.innerHTML = html;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createSSRApp(Density);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toBe("compact");
    const messages = [...warn.mock.calls, ...error.mock.calls].flat();
    expect(messages.join(" ")).not.toMatch(/hydration/i);
    app.unmount();
    warn.mockRestore();
    error.mockRestore();
  });
});

describe("the preferences cookie", () => {
  it("stays under its budget however many tables are visited, dropping the least recently written", () => {
    for (let index = 0; index < VISITED_TABLES; index += 1) {
      visitTypicalTable(...tableIds(index));
    }
    expect(Math.max(...writes)).toBeLessThanOrEqual(
      MAX_PREFERENCES_COOKIE_BYTES,
    );
    const last = tableIds(VISITED_TABLES - 1);
    expect(useTablePreferences(...last).get("sorting", DEFAULT_SORT)).toEqual([
      { id: "name", desc: true },
    ]);
    expect(
      useTablePreferences(...tableIds(0)).get("sorting", DEFAULT_SORT),
    ).toEqual(DEFAULT_SORT);
  });

  it("drops the table states before the remembered periods", () => {
    const { setPreference, getPreference } = usePreferences();
    setPreference("periods", { "orders#period": { period: "7d" } });
    for (let index = 0; index < VISITED_TABLES; index += 1) {
      visitTypicalTable(...tableIds(index));
    }
    expect(getPreference("periods")).toEqual({
      "orders#period": { period: "7d" },
    });
  });

  it("never evicts a module's own key, and refuses a write that cannot fit", () => {
    const { setPreference, getPreference } = usePreferences();
    setPreference("dms-lang.workspaceSort", { field: "name", desc: false });
    for (let index = 0; index < VISITED_TABLES; index += 1) {
      visitTypicalTable(...tableIds(index));
    }
    expect(getPreference("dms-lang.workspaceSort")).toEqual({
      field: "name",
      desc: false,
    });

    const before = stored.value;
    setPreference("dms-lang.huge", "x".repeat(MAX_PREFERENCES_COOKIE_BYTES));
    expect(stored.value).toBe(before);
    expect(getPreference("dms-lang.huge")).toBeUndefined();
  });

  it("reads a corrupt value as no preferences", () => {
    installCookie("not*base64{");
    const { getPreference, setPreference } = usePreferences();
    expect(getPreference("dms-lang.workspaceSort", "default")).toBe("default");
    setPreference("dms-lang.workspaceSort", "name");
    expect(getPreference("dms-lang.workspaceSort")).toBe("name");
  });

  it("is shared by every caller", () => {
    const first = usePreferences();
    const second = usePreferences();
    first.setPreference("module.theme", "dense");
    expect(second.getPreference("module.theme")).toBe("dense");
  });

  it("deletes the user-preferences cookie it replaces, unread", () => {
    document.cookie = `user-preferences=${encodeURIComponent(
      JSON.stringify({ tables: { a: { b: { density: "compact" } } } }),
    )}; path=/`;
    const { preferences } = usePreferences();
    expect(document.cookie).not.toMatch(/user-preferences=/);
    expect(preferences.value).toEqual({});
  });
});
