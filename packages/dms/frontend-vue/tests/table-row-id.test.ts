/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  h,
  reactive,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from "vue";
import { useTable } from "../layers/dms-ui/app/entries/composables/table/useTable";
import * as ruleEvaluator from "../layers/dms-core/app/utils/row-action-rule-evaluator";
import * as colors from "../layers/dms-core/app/types/color";
import { isFunction, isString } from "../layers/dms-core/app/utils/type-check";
import { modelRef } from "./fixtures/modelRef";
import { TABLE_STYLE_SLOTS } from "./fixtures/tableStyleSlots";

type Row = Record<string, unknown>;

beforeEach(() => {
  for (const [name, value] of Object.entries({ ...ruleEvaluator, ...colors })) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("watchEffect", watchEffect);
  vi.stubGlobal("shallowRef", shallowRef);
  vi.stubGlobal("isFunction", isFunction);
  vi.stubGlobal("h", h);
  vi.stubGlobal("isString", isString);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsRouter", () => ({ push: vi.fn() }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useDmsAppConfig", () => ({}));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string) => key,
  }));
  vi.stubGlobal("useConfirm", () => ({ confirm: vi.fn() }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function rowIdsOf(rowIdKey: string, data: Row[]): string[] {
  const { table } = useTable<Row>({
    tableProps: reactive({
      data,
      rowIdKey,
      columns: [{ accessorKey: "label", header: "Label" }],
    }),
    emits: () => undefined,
    ui: computed(() => TABLE_STYLE_SLOTS),
    states: {
      globalFilterState: modelRef(""),
      columnFiltersState: modelRef([]),
      columnOrderState: modelRef([]),
      columnVisibilityState: modelRef({}),
      columnPinningState: modelRef({}),
      columnSizingState: modelRef({}),
      rowSelectionState: modelRef({}),
      sortingState: modelRef([]),
      expandedState: modelRef({}),
      paginationState: modelRef({ pageIndex: 0, pageSize: 10 }),
    },
  });
  return table.getRowModel().rows.map((row) => row.id);
}

describe("the id of a table row", () => {
  it("reads a string id as it is", () => {
    expect(rowIdsOf("id", [{ id: "inv-1" }])).toEqual(["inv-1"]);
  });

  it("reads a nested id by its path", () => {
    expect(rowIdsOf("meta.key", [{ meta: { key: "a-7" } }])).toEqual(["a-7"]);
  });

  it("reads a numeric id as the string every row action takes", () => {
    expect(rowIdsOf("id", [{ id: 42 }])).toEqual(["42"]);
  });
});
