// @vitest-environment jsdom
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

type Row = Record<string, unknown>;

const ROW: Row = { _id: "fr", name: "Français", code: "fr" };

const translateKey = (key: string, params: Record<string, unknown> = {}) =>
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
  mounted.splice(0).forEach((app) => app.unmount());
  document.body.replaceChildren();
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

function renderCell(cell: VNode) {
  const app = createApp({ render: () => cell });
  const host = document.createElement("div");
  document.body.append(host);
  app.mount(host);
  mounted.push(app);
  return host;
}

function menuButtonProps(cell: VNode): Record<string, unknown> {
  const button = renderCell(cell).querySelector('[aria-haspopup="menu"]');
  expect(button).not.toBeNull();
  return { "aria-label": button?.getAttribute("aria-label") };
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
