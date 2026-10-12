/**
 * A row's actions are named after the row: a custom action's label fills its
 * `{field}` braces from the row ("Translate {name}"), and the ⋯ button opening
 * the row's menu has an accessible name — "Actions for <label>" by default,
 * or the table's own `rowActions.menuLabel`.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  h,
  ref,
  shallowRef,
  watch,
  watchEffect,
  type VNode,
} from "vue";
import { useTableColumns } from "../layers/dms-ui/app/build/composables/table/useTableColumns";
import * as ruleEvaluator from "../layers/dms-core/app/utils/row-action-rule-evaluator";
import * as colors from "../layers/dms-core/app/types/color";
import * as buttons from "../layers/dms-core/app/types/button";
import * as sizes from "../layers/dms-core/app/types/size";

vi.mock("@nuxt/ui/components/Button.vue", () => ({
  default: { name: "UButton", render: () => null },
}));
vi.mock("@nuxt/ui/components/Checkbox.vue", () => ({
  default: { render: () => null },
}));
vi.mock("@nuxt/ui/components/DropdownMenu.vue", () => ({
  default: { name: "UDropdownMenu", render: () => null },
}));
vi.mock("@nuxt/ui/runtime/utils/index.js", () => ({
  get: (row: Record<string, unknown>, key: string) => row[key],
}));

type Row = Record<string, unknown>;

const ROW: Row = { _id: "fr", name: "Français", code: "fr" };

const translateKey = (key: string, params: Record<string, unknown> = {}) =>
  Object.keys(params).length > 0 ? `${key}(${JSON.stringify(params)})` : key;

beforeEach(() => {
  for (const [name, value] of Object.entries({
    ...ruleEvaluator,
    ...colors,
    ...buttons,
    ...sizes,
  })) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("watchEffect", watchEffect);
  vi.stubGlobal("shallowRef", shallowRef);
  vi.stubGlobal("isFunction", (value: unknown) => typeof value === "function");
  vi.stubGlobal("h", h);
  vi.stubGlobal("isString", (value: unknown) => typeof value === "string");
  vi.stubGlobal("useI18n", () => ({ t: translateKey }));
  vi.stubGlobal("useDmsRouter", () => ({ push: vi.fn() }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useDmsAppConfig", () => ({
    ui: { icons: { ellipsis: "i-ellipsis" } },
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string, params?: Record<string, unknown>) =>
      key.startsWith("$") ? translateKey(key.slice(1), params ?? {}) : key,
  }));
  vi.stubGlobal("useConfirm", () => ({ confirm: vi.fn() }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface ActionsCellOptions {
  custom: Array<Record<string, unknown>>;
  menuLabel?: string;
  labelKey?: string;
}

function actionsCell({ custom, menuLabel, labelKey }: ActionsCellOptions) {
  const { columns } = useTableColumns<Row>({
    data: computed(() => [ROW]),
    columns: [{ accessorKey: "name", header: "Name" }],
    rowIdKey: "_id",
    rowActions: {
      add: false,
      copyLink: false,
      delete: false,
      details: false,
      duplicate: false,
      edit: false,
      custom: custom as never,
      menuLabel,
    },
    labelKey,
    emits: (() => undefined) as never,
    ui: computed(() => ({ rowAction: () => "" }) as never),
  });
  const column = columns.value.find((entry) => entry.id === "actions");
  const cell = column?.cell as (context: unknown) => VNode;
  return cell({ row: { original: ROW, id: "fr" } });
}

const childrenOf = (node: VNode) => node.children as VNode[];

function menuButtonProps(cell: VNode): Record<string, unknown> {
  const menu = childrenOf(cell).find(
    (child) => (child.type as { name?: string }).name === "UDropdownMenu",
  );
  const slots = menu?.children as { default: () => VNode };
  return slots.default().props ?? {};
}

const MENU_ACTION = { label: "Remove", target: { type: "api", url: "/x" } };

it("names the ⋯ button after the row's label field by default", () => {
  const cell = actionsCell({ custom: [MENU_ACTION], labelKey: "name" });
  expect(menuButtonProps(cell)["aria-label"]).toBe(
    'dms.table.row_actions_for({"label":"Français"})',
  );
});

it("names the ⋯ button generically without a label field", () => {
  const cell = actionsCell({ custom: [MENU_ACTION] });
  expect(menuButtonProps(cell)["aria-label"]).toBe("dms.table.row_actions");
});

it("names the ⋯ button with menuLabel, filled from the row", () => {
  const literal = actionsCell({
    custom: [MENU_ACTION],
    menuLabel: "Actions for {name} ({code})",
  });
  expect(menuButtonProps(literal)["aria-label"]).toBe(
    "Actions for Français (fr)",
  );
  const key = actionsCell({
    custom: [MENU_ACTION],
    menuLabel: "$dms_lang.languages.menu",
  });
  expect(menuButtonProps(key)["aria-label"]).toContain(
    'dms_lang.languages.menu({"_id":"fr","name":"Français"',
  );
});

it("fills a custom action's label from the row, inline and in the menu", () => {
  const cell = actionsCell({
    custom: [
      {
        label: "Translate {name}",
        isVisible: true,
        showLabel: true,
        target: { type: "page", url: "/lang?locale={code}" },
      },
      {
        label: "$dms_lang.languages.remove",
        target: { type: "api", url: "/x" },
      },
      {
        label: "Keep {unknown} as written",
        target: { type: "api", url: "/y" },
      },
    ],
  });
  const [inline] = childrenOf(cell);
  expect(inline.props?.label).toBe("Translate Français");
  expect(inline.props?.["aria-label"]).toBe("Translate Français");

  const menu = childrenOf(cell).find(
    (child) => (child.type as { name?: string }).name === "UDropdownMenu",
  );
  const items = (menu?.props?.items as Array<Array<{ label: string }>>).flat();
  expect(items.map((item) => item.label)).toEqual([
    expect.stringContaining('dms_lang.languages.remove({"_id":"fr"'),
    "Keep {unknown} as written",
  ]);
});
