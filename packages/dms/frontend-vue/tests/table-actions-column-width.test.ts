import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  h,
  nextTick,
  reactive,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from "vue";
import { useTable } from "../layers/dms-ui/app/build/composables/table/useTable";
import { useTableColumns } from "../layers/dms-ui/app/build/composables/table/useTableColumns";
import * as ruleEvaluator from "../layers/dms-core/app/utils/row-action-rule-evaluator";
import * as colors from "../layers/dms-core/app/types/color";
import { isFunction, isString } from "../layers/dms-core/app/utils/type-check";

type Row = { _id: string; status?: boolean };

const PENDING = { field: "status", equals: true };
const EXPIRED = { field: "status", equals: false };

// SAFETY: Sizing reads labels, visibility, and rules only; these fixture actions are never invoked and need no targets.
const rowActions = {
  add: false,
  copyLink: false,
  delete: false,
  details: false,
  duplicate: false,
  edit: false,
  hasSelection: false,
  custom: [
    { label: "Resend", isVisible: true, showLabel: true },
    { label: "Revoke", isVisible: true, showLabel: true, rule: PENDING },
    { label: "Remove", isVisible: true, showLabel: true, rule: EXPIRED },
  ],
} as NonNullable<Parameters<typeof useTableColumns<Row>>[0]["rowActions"]>;

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

function actionsColumnSize(rows: Row[]): number | undefined {
  const { columns } = useTableColumns<Row>({
    data: computed(() => rows),
    columns: [{ accessorKey: "email", header: "Email" }],
    rowIdKey: "_id",
    rowActions,
    emits: () => undefined,
    // SAFETY: These tests read column widths, never the style slots used by rendered cells.
    ui: computed(
      () => ({}) as Parameters<typeof useTableColumns<Row>>[0]["ui"]["value"],
    ),
  });
  return columns.value.find((column) => column.id === "actions")?.size;
}

it("sizes an empty list's actions as a row with no values, through the rules", () => {
  const empty = actionsColumnSize([]);
  const pending = actionsColumnSize([{ _id: "1", status: true }]);

  expect(empty).toBeLessThan(pending!);
  expect(empty).toBe(actionsColumnSize([{ _id: "1" }]));
});

it("resizes the table's actions column once the rows arrive", async () => {
  const tableProps = reactive<{
    data: Row[];
    columns: { accessorKey: string; header: string }[];
    rowActions: typeof rowActions;
  }>({
    data: [],
    columns: [{ accessorKey: "email", header: "Email" }],
    rowActions,
  });
  const { table } = useTable<Row>({
    tableProps,
    emits: () => undefined,
    // SAFETY: Only column sizes are read; no cell or header style slot is rendered.
    ui: computed(
      () => ({}) as Parameters<typeof useTable<Row>>[0]["ui"]["value"],
    ),
    // SAFETY: useTable reads and writes .value on these refs; it does not use ModelRef's tuple metadata.
    states: {
      globalFilterState: ref(""),
      columnFiltersState: ref([]),
      columnOrderState: ref([]),
      columnVisibilityState: ref({}),
      columnPinningState: ref({}),
      columnSizingState: ref({}),
      rowSelectionState: ref({}),
      sortingState: ref([]),
      expandedState: ref({}),
      paginationState: ref({ pageIndex: 0, pageSize: 10 }),
    } as Parameters<typeof useTable<Row>>[0]["states"],
  });
  const emptyWidth = table.getColumn("actions")!.getSize();

  tableProps.data = [{ _id: "1", status: true }];
  await nextTick();

  expect(table.getColumn("actions")!.getSize()).toBe(
    actionsColumnSize([{ _id: "1", status: true }]),
  );
  expect(table.getColumn("actions")!.getSize()).toBeGreaterThan(emptyWidth);
});
