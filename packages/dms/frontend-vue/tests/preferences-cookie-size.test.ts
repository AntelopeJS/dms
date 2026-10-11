import { computed, readonly, ref, toRaw, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PREFERENCES_COOKIE_BYTES,
  usePreferences,
} from "../layers/dms-core/app/composables/user/usePreferences";

const COOKIE_NAME = "user-preferences";
const TABLE_COUNT = 80;
const COLUMN_COUNT = 12;
const PAGE_SIZE = 50;

// What the browser would send back: the cookie header entry of a value.
const cookieBytes = (value: unknown): number =>
  `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(value))}`.length;

let stored: Ref<Record<string, unknown>>;
let writes: number[];

// `useDmsCookie`: one shared ref per name, every assignment written out.
const installCookie = (initial: Record<string, unknown>) => {
  stored = ref(initial);
  writes = [];
  const cookie = computed({
    get: () => stored.value,
    set: (next) => {
      writes.push(cookieBytes(toRaw(next)));
      stored.value = next;
    },
  });
  vi.stubGlobal("useDmsCookie", () => cookie);
};

const columnOrder = (table: number) =>
  Array.from({ length: COLUMN_COUNT }, (_, c) => `column-${table}-${c}`);

const visitTable = (table: number) => {
  const { setPreference } = usePreferences();
  const key = `tables.table-${table}.page-${table}`;
  setPreference(`${key}.columnOrder`, columnOrder(table));
  setPreference(`${key}.sorting`, [{ id: "name", desc: false }]);
  setPreference(`${key}.pagination`, { pageIndex: 0, pageSize: PAGE_SIZE });
};

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("readonly", readonly);
  vi.stubGlobal("computed", computed);
  installCookie({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the user-preferences cookie", () => {
  it("stays under its budget however many tables are visited", () => {
    for (let table = 0; table < TABLE_COUNT; table += 1) visitTable(table);

    expect(Math.max(...writes)).toBeLessThanOrEqual(
      MAX_PREFERENCES_COOKIE_BYTES,
    );
    const { getPreference } = usePreferences();
    const last = TABLE_COUNT - 1;
    expect(
      getPreference(`tables.table-${last}.page-${last}.columnOrder`),
    ).toEqual(columnOrder(last));
    expect(getPreference("tables.table-0.page-0.columnOrder")).toBeUndefined();
  });

  it("evicts the table written least recently, not the one read back", () => {
    for (let table = 0; table < TABLE_COUNT; table += 1) {
      visitTable(table);
      // Table 0 is open in every session: written again each time.
      usePreferences().setPreference(
        "tables.table-0.page-0.density",
        "compact",
      );
    }

    const { getPreference } = usePreferences();
    expect(getPreference("tables.table-0.page-0.density")).toBe("compact");
    expect(getPreference("tables.table-1.page-1.columnOrder")).toBeUndefined();
  });

  it("keeps the preferences that are not table state", () => {
    const { setPreference } = usePreferences();
    setPreference("periods", { "orders#period": { period: "7d" } });
    setPreference("module.theme", "dense");

    for (let table = 0; table < TABLE_COUNT; table += 1) visitTable(table);

    const { getPreference } = usePreferences();
    expect(getPreference("periods")).toEqual({
      "orders#period": { period: "7d" },
    });
    expect(getPreference("module.theme")).toBe("dense");
  });

  it("drops the oldest remembered periods once no table state is left", () => {
    const { setPreference, getPreference } = usePreferences();
    const periods: Record<string, unknown> = {};
    for (let selector = 0; selector < TABLE_COUNT; selector += 1) {
      periods[`page-${selector}#period`] = {
        from: "2026-01-01",
        to: "2026-12-31",
      };
      setPreference("periods", periods);
    }

    expect(Math.max(...writes)).toBeLessThanOrEqual(
      MAX_PREFERENCES_COOKIE_BYTES,
    );
    const last = `page-${TABLE_COUNT - 1}#period`;
    expect(
      getPreference<Record<string, unknown>>("periods")[last],
    ).toBeDefined();
    expect(
      getPreference<Record<string, unknown>>("periods")["page-0#period"],
    ).toBeUndefined();
  });

  it("refuses a single value too large for the cookie", () => {
    const { setPreference, getPreference } = usePreferences();
    setPreference("module.small", 1);
    const writesBefore = writes.length;

    setPreference("module.huge", "x".repeat(MAX_PREFERENCES_COOKIE_BYTES));

    expect(writes).toHaveLength(writesBefore);
    expect(getPreference("module.huge")).toBeUndefined();
    expect(getPreference("module.small")).toBe(1);
  });

  it("trims a cookie that already outgrew its budget", () => {
    const tables: Record<string, unknown> = {};
    for (let table = 0; table < TABLE_COUNT; table += 1) {
      tables[`table-${table}`] = {
        [`page-${table}`]: { columnOrder: columnOrder(table) },
      };
    }
    installCookie({ tables, module: { theme: "dense" } });

    const { getPreference } = usePreferences();

    expect(writes).toHaveLength(1);
    expect(writes[0]).toBeLessThanOrEqual(MAX_PREFERENCES_COOKIE_BYTES);
    expect(getPreference("module.theme")).toBe("dense");
  });

  it("shares one tree between every caller", () => {
    const first = usePreferences();
    const second = usePreferences();

    first.setPreference("tables.a.b.density", "compact");

    expect(second.getPreference("tables.a.b.density")).toBe("compact");
  });
});
