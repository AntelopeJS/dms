// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  watch,
  type App,
  type VNode,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGroupedRows } from "../layers/dms-ui/app/build/composables/table-view/useGroupedRows";
import {
  dateGroupLabel,
  groupedSorting,
  groupFilter,
  NO_GROUP_KEY,
  rowGroupKey,
} from "../layers/dms-ui/app/build/composables/table-view/utils/groupedRows";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types";

const tableSource = readFileSync(
  resolve(__dirname, "../layers/dms-ui/app/build/components/table/Table.vue"),
  "utf8",
);
const tableViewSource = readFileSync(
  resolve(
    __dirname,
    "../layers/dms-ui/app/components/table-view/TableView.vue",
  ),
  "utf8",
);

const LABELS = {
  today: "Today",
  yesterday: "Yesterday",
  weekOf: (date: string) => `Week of ${date}`,
};
const local = (day: number, hour: number) =>
  new Date(2026, 8, day, hour, 30).toISOString();

describe("grouped rows", () => {
  it("files a row under its value, a relation under its id", () => {
    expect(rowGroupKey("open", "value", "en-GB")).toBe("open");
    expect(rowGroupKey(true, "value", "en-GB")).toBe("true");
    expect(rowGroupKey({ _id: "r1", name: "Ops" }, "value", "en-GB")).toBe(
      "r1",
    );
    expect(rowGroupKey(null, "value", "en-GB")).toBe(NO_GROUP_KEY);
  });

  it("files a date under its calendar day and week, in the reader's time zone", () => {
    expect(rowGroupKey(local(29, 23), "day", "en-GB")).toBe("2026-09-29");
    expect(rowGroupKey(local(29, 1), "day", "en-GB")).toBe("2026-09-29");
    // Tuesday Sep 29: the week starts on Monday Sep 28 in en-GB.
    expect(rowGroupKey(local(29, 9), "week", "en-GB")).toBe("2026-09-28");
    expect(rowGroupKey(local(27, 9), "week", "en-GB")).toBe("2026-09-21");
    expect(rowGroupKey(undefined, "day", "en-GB")).toBe(NO_GROUP_KEY);
  });

  it("names day and week groups", () => {
    const now = new Date(2026, 8, 29, 10);
    expect(dateGroupLabel("2026-09-29", "day", "en-GB", LABELS, now)).toBe(
      "Today · 29 Sept",
    );
    expect(dateGroupLabel("2026-09-28", "day", "en-GB", LABELS, now)).toBe(
      "Yesterday · 28 Sept",
    );
    expect(dateGroupLabel("2026-09-21", "week", "en-GB", LABELS, now)).toBe(
      "Week of 21 Sept",
    );
  });

  it("filters a group's rows for its count", () => {
    expect(groupFilter("status", "open", "value")).toEqual({
      accessorKey: "status",
      mode: "is",
      value: "open",
    });
    expect(groupFilter("createdAt", "2026-09-29", "day")).toEqual({
      accessorKey: "createdAt",
      mode: "is_between",
      value: "2026-09-29,2026-09-29",
    });
    expect(groupFilter("createdAt", "2026-09-28", "week")).toEqual({
      accessorKey: "createdAt",
      mode: "is_between",
      value: "2026-09-28,2026-10-04",
    });
    expect(groupFilter("status", NO_GROUP_KEY, "value")).toBe(undefined);
  });

  it("lists the rows sorted on the grouped column, in the user's direction on it", () => {
    const byDay = { groupByField: "createdAt", by: "day" as const };
    expect(groupedSorting([{ id: "title", desc: false }], byDay)).toEqual([
      { id: "createdAt", desc: true },
    ]);
    expect(groupedSorting([{ id: "createdAt", desc: false }], byDay)).toEqual([
      { id: "createdAt", desc: false },
    ]);
    expect(groupedSorting([], { groupByField: "status" })).toEqual([
      { id: "status", desc: false },
    ]);
  });
});

describe("grouped display wiring", () => {
  it("draws a header row before each group of the page", () => {
    expect(tableSource).toMatch(
      /v-for="\{ kind, id, row, key \} in bodyEntries"/,
    );
    expect(tableSource).toContain(':class="uiTable.groupCell()"');
    expect(tableSource).toMatch(/if \(key !== currentKey\) \{/);
  });

  it("sorts the list on the grouped column while the grouped display shows", () => {
    expect(tableViewSource).toMatch(
      /isGroupedDisplay\.value && groupedOptions\s*\?\s*groupedSorting\(picked, groupedOptions\)/,
    );
    expect(tableViewSource).toContain(':grouping="grouping"');
  });
});

describe("useGroupedRows", () => {
  let app: App | undefined;

  beforeEach(() => {
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("watch", watch);
    vi.stubGlobal("useI18n", () => ({
      t: (key: string, params?: Record<string, string>) =>
        params ? `${key}:${JSON.stringify(params)}` : key,
      locale: ref("en-GB"),
    }));
    vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("counts the groups listed, with the rows' own filters, and heads them", async () => {
    const asked: unknown[] = [];
    const rows = ref([
      { _id: "1", status: "open" },
      { _id: "2", status: "open" },
      { _id: "3", status: null },
      { _id: "4", status: "closed" },
    ]);
    let grouped: ReturnType<typeof useGroupedRows> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          grouped = useGroupedRows({
            grouped: { groupByField: "status", count: true, collapsible: true },
            isActive: computed(() => true),
            columns: [
              { id: "status", accessorKey: "status", header: "Status" },
            ] as TableViewColumn[],
            rows,
            countQuery: (filter) => ({
              search: "late",
              [`filter_${filter.accessorKey}`]: `${filter.mode}:${filter.value}`,
            }),
            countBatch: async (queries) => {
              asked.push(queries);
              return { open: 12, closed: 4 };
            },
          });
          return () => h("div");
        },
      }),
    );
    app.mount(document.createElement("div"));
    await nextTick();
    await nextTick();

    expect(asked).toEqual([
      [
        { id: "open", query: { search: "late", filter_status: "is:open" } },
        { id: "closed", query: { search: "late", filter_status: "is:closed" } },
      ],
    ]);
    const grouping = grouped!.grouping.value!;
    expect(grouping.collapsible).toBe(true);
    expect(grouping.keyOf(rows.value[0]!)).toBe("open");
    expect(grouping.countOf?.("open")).toBe(12);
    const noValue = grouping.header(NO_GROUP_KEY, rows.value[2]!) as VNode;
    expect(noValue.children).toBe("dms.table.grouped.none");
  });
});
