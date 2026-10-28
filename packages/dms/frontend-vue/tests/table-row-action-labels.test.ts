/** @vitest-environment jsdom */
/**
 * A row's actions are named after the row: a custom action's label fills its
 * `{field}` braces from the row ("Translate {name}"), and the ⋯ button opening
 * the row's menu has an accessible name — "Actions for <label>" by default,
 * or the table's own `rowActions.menuLabel`.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  h,
  nextTick,
  ref,
  shallowRef,
  watch,
  watchEffect,
  type VNode,
  type App,
} from "vue";
import { useTableColumns } from "../layers/dms-ui/app/build/composables/table/useTableColumns";
import * as ruleEvaluator from "../layers/dms-core/app/utils/row-action-rule-evaluator";
import * as colors from "../layers/dms-core/app/types/color";
import * as buttons from "../layers/dms-core/app/types/button";
import * as sizes from "../layers/dms-core/app/types/size";
import { isFunction, isString } from "../layers/dms-core/app/utils/type-check";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";

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

type LabelAction = Omit<CustomRowAction, "target"> & {
  target: Pick<
    Extract<CustomRowAction["target"], { type: "api" | "page" }>,
    "type" | "url"
  >;
};

interface ActionsCellOptions {
  custom: LabelAction[];
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
      // SAFETY: These label/menu tests never select an action; their API targets omit the unused successMessage.
      custom: custom as CustomRowAction[],
      menuLabel,
    },
    labelKey,
    emits: () => undefined,
    // SAFETY: This actions-cell probe uses only rowAction; no header or selection cell is rendered.
    ui: computed(
      () =>
        ({ rowAction: () => "" }) as Parameters<
          typeof useTableColumns<Row>
        >[0]["ui"]["value"],
    ),
  });
  const column = columns.value.find((entry) => entry.id === "actions");
  // SAFETY: The actions column installs a cell callback that only reads row.original and row.id.
  const cell = column?.cell as (context: {
    row: { original: Row; id: string };
  }) => VNode;
  return cell({ row: { original: ROW, id: "fr" } });
}

function renderCell(cell: VNode) {
  const app = createApp({ render: () => cell });
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
  target: { type: "api", url: "/x" },
} satisfies LabelAction;

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
        target: { type: "api", url: "/x" },
      },
      {
        label: "Keep {unknown} as written",
        target: { type: "api", url: "/y" },
      },
    ],
  });
  const host = renderCell(cell);
  const inline = host.querySelector('[aria-label="Translate Français"]');
  expect(inline?.textContent).toBe("Translate Français");
  const menu = host.querySelector('[aria-haspopup="menu"]')!;
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
