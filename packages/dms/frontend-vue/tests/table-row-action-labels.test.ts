// @vitest-environment jsdom
/**
 * A row's actions are named after the row: a custom action's label fills its
 * `{field}` braces from the row ("Translate {name}"), and the ⋯ button opening
 * the row's menu has an accessible name — "Actions for <label>" by default,
 * or the table's own `rowActions.menuLabel`. An action whose rule keeps it off
 * the row says why when it declares a `disabledReason`, and is hidden
 * otherwise.
 *
 * @packageDocumentation
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  h,
  isVNode,
  nextTick,
  ref,
  shallowRef,
  watch,
  watchEffect,
  type VNode,
  type App,
} from "vue";
import { createTable, getCoreRowModel } from "@tanstack/vue-table";
import UApp from "@nuxt/ui/components/App.vue";
import UTooltip from "@nuxt/ui/components/Tooltip.vue";
import { useTableColumns } from "../layers/dms-ui/app/entries/composables/table/useTableColumns";
import * as ruleEvaluator from "../layers/dms-core/app/utils/row-action-rule-evaluator";
import * as colors from "../layers/dms-core/app/types/color";
import * as buttons from "../layers/dms-core/app/types/button";
import * as sizes from "../layers/dms-core/app/types/size";
import { isFunction, isString } from "../layers/dms-core/app/utils/type-check";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";
import { TABLE_STYLE_SLOTS } from "./fixtures/tableStyleSlots";
import { defined } from "./helpers/defined";

type Row = { _id: string; name: string; code: string };

const ROW = { _id: "fr", name: "Français", code: "fr" };

const translateKey = (key: string, params: Record<string, string> = {}) =>
  Object.keys(params).length > 0 ? `${key}(${JSON.stringify(params)})` : key;

const mounted: App[] = [];

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
  vi.stubGlobal("isFunction", isFunction);
  vi.stubGlobal("h", h);
  vi.stubGlobal("isString", isString);
  vi.stubGlobal("useI18n", () => ({ t: translateKey }));
  vi.stubGlobal("useDmsRouter", () => ({ push: vi.fn() }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useDmsAppConfig", () => ({
    ui: { icons: { ellipsis: "i-ellipsis" } },
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string, params?: Parameters<typeof translateKey>[1]) =>
      key.startsWith("$") ? translateKey(key.slice(1), params ?? {}) : key,
  }));
  vi.stubGlobal("useConfirm", () => ({ confirm: vi.fn() }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

interface ActionsCellOptions {
  custom: CustomRowAction[];
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
      custom,
      menuLabel,
    },
    labelKey,
    emits: () => undefined,
    ui: computed(() => TABLE_STYLE_SLOTS),
  });
  const table = createTable<Row>({
    data: [ROW],
    columns: columns.value,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row._id,
    state: {},
    onStateChange: () => undefined,
    renderFallbackValue: null,
  });
  const context = table
    .getRowModel()
    .rows[0]?.getAllCells()
    .find((entry) => entry.column.id === "actions")
    ?.getContext();
  const cell = columns.value.find((entry) => entry.id === "actions")?.cell;
  if (!context || !isFunction(cell))
    throw new Error("the table has no actions cell");
  const rendered: unknown = cell(context);
  if (!isVNode(rendered)) throw new Error("the actions cell is not a VNode");
  return rendered;
}

function renderCell(cell: VNode) {
  const app = createApp({ render: () => h(UApp, null, () => cell) });
  app.component("UTooltip", UTooltip);
  const host = document.createElement("div");
  document.body.append(host);
  app.mount(host);
  mounted.push(app);
  return host;
}

function menuButtonProps(cell: VNode) {
  const button = renderCell(cell).querySelector('[aria-haspopup="menu"]');
  expect(button).not.toBeNull();
  return { "aria-label": button?.getAttribute("aria-label") };
}

const MENU_ACTION = {
  label: "Remove",
  target: { type: "api", url: "/x", successMessage: "Removed" },
} satisfies CustomRowAction;

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

it("fills a custom action's label from the row, inline and in the menu", async () => {
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
        target: { type: "api", url: "/x", successMessage: "Removed" },
      },
      {
        label: "Keep {unknown} as written",
        target: { type: "api", url: "/y", successMessage: "Kept" },
      },
    ],
  });
  const host = renderCell(cell);
  const inline = host.querySelector('[aria-label="Translate Français"]');
  expect(inline?.textContent).toBe("Translate Français");
  const menu = defined(host.querySelector('[aria-haspopup="menu"]'));
  menu.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve));
  const items = [...document.querySelectorAll('[role="menuitem"]')];
  expect(items.map((item) => item.textContent?.trim())).toEqual([
    expect.stringContaining('dms_lang.languages.remove({"_id":"fr"'),
    "Keep {unknown} as written",
  ]);
});

const LOCKED = { field: "code", notEquals: "fr" } as const;

async function openMenu(cell: VNode) {
  const host = renderCell(cell);
  defined(host.querySelector('[aria-haspopup="menu"]')).dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve));
  return [...document.querySelectorAll('[role="menuitem"]')];
}

it("keeps a rule-blocked action in the menu, disabled, with its reason filled from the row", async () => {
  const items = await openMenu(
    actionsCell({
      custom: [
        MENU_ACTION,
        {
          label: "Rename",
          rule: LOCKED,
          disabledReason: "{name} is the default language",
          target: { type: "api", url: "/rename", successMessage: "Renamed" },
        },
      ],
    }),
  );
  const rename = items.find((item) => item.textContent?.includes("Rename"));
  expect(rename?.getAttribute("aria-disabled")).toBe("true");
  expect(rename?.textContent).toContain("Français is the default language");
});

it("keeps a rule-blocked inline action on the row, disabled, its reason shown on focus", async () => {
  const host = renderCell(
    actionsCell({
      custom: [
        {
          label: "Rename",
          isVisible: true,
          showLabel: true,
          rule: LOCKED,
          disabledReason: "Locked",
          target: { type: "api", url: "/rename", successMessage: "Renamed" },
        },
      ],
    }),
  );
  const rename = host.querySelector<HTMLButtonElement>('[aria-label="Rename"]');
  expect(rename?.disabled).toBe(true);
  const wrapper = rename?.parentElement;
  expect(wrapper?.getAttribute("tabindex")).toBe("0");
  wrapper?.dispatchEvent(new FocusEvent("focus"));
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve));
  expect(document.body.textContent).toContain("Locked");
});

it("hides a rule-blocked action that gives no reason", async () => {
  const items = await openMenu(
    actionsCell({
      custom: [
        MENU_ACTION,
        {
          label: "Rename",
          rule: LOCKED,
          target: { type: "api", url: "/rename", successMessage: "Renamed" },
        },
      ],
    }),
  );
  expect(items.map((item) => item.textContent?.trim())).toEqual(["Remove"]);
});
