import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, h, ref, watch } from "vue";
import { useTableColumns } from "../layers/dms-ui/app/build/composables/table/useTableColumns";
import * as ruleEvaluator from "../layers/dms-core/app/utils/row-action-rule-evaluator";
import * as colors from "../layers/dms-core/app/types/color";

vi.mock("@nuxt/ui/components/Button.vue", () => ({
  default: { render: () => null },
}));
vi.mock("@nuxt/ui/components/Checkbox.vue", () => ({
  default: { render: () => null },
}));
vi.mock("@nuxt/ui/components/DropdownMenu.vue", () => ({
  default: { render: () => null },
}));
vi.mock("@nuxt/ui/runtime/utils/index.js", () => ({
  get: (row: Record<string, unknown>, key: string) => row[key],
}));

type Row = Record<string, unknown>;

// An invitation is pending (Revoke) or expired (Remove), never both: two
// labelled actions sharing a row only through their rules.
const PENDING = { field: "status", equals: true };
const EXPIRED = { field: "status", equals: false };

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
};

beforeEach(() => {
  for (const [name, value] of Object.entries({ ...ruleEvaluator, ...colors })) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("h", h);
  vi.stubGlobal("isString", (value: unknown) => typeof value === "string");
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
    emits: (() => undefined) as never,
    ui: computed(() => ({}) as never),
  });
  return columns.value.find((column) => column.id === "actions")?.size;
}

it("sizes an empty list's actions as a row with no values, through the rules", () => {
  const empty = actionsColumnSize([]);
  const pending = actionsColumnSize([{ _id: "1", status: true }]);
  // Resend alone shows on a row without a status; a pending row adds Revoke.
  expect(empty).toBeLessThan(pending!);
  expect(empty).toBe(actionsColumnSize([{ _id: "1" }]));
});
