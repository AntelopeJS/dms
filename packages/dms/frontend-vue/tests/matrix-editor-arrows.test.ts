/** @vitest-environment jsdom */
/**
 * A Matrix cell's editor left by ArrowUp or ArrowDown: the value typed into
 * its input is saved before the focus moves a row, for a number cell and a
 * text cell. The number input is reka-ui's number field, the one the DMS
 * number input is built on: it takes typed text into its value only on
 * Enter or when it loses the focus.
 */
import { defineComponent, h, nextTick, ref, shallowRef } from "vue";
import { NumberFieldInput, NumberFieldRoot } from "reka-ui";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { registerDmsComponent } from "#dms/frontend-module";
import { useRealDataEngine } from "./fixtures/dataEngine";
import { mountInBrowser } from "./helpers/api-data-runtime";
import { stubBlockRuntime } from "./helpers/block-runtime";
import type {
  MatrixColumn,
  MatrixData,
  MatrixSaveRequest,
} from "../layers/dms-ui/app/types/matrix";

/** The number input as a Matrix cell gets it: unclamped, so `min` and `max` stay off the field. */
const NumberInput = defineComponent({
  inheritAttrs: false,
  props: { modelValue: { type: Number, default: undefined } },
  emits: ["update:modelValue"],
  setup:
    (props, { emit }) =>
    () =>
      h(
        NumberFieldRoot,
        {
          modelValue: props.modelValue,
          "onUpdate:modelValue": (value: number | undefined) =>
            emit("update:modelValue", value),
        },
        () => h(NumberFieldInput),
      ),
});

const TextInput = defineComponent({
  inheritAttrs: false,
  props: { modelValue: { type: String, default: "" } },
  emits: ["update:modelValue"],
  setup:
    (props, { emit }) =>
    () =>
      h("input", {
        value: props.modelValue,
        onInput: (event: Event) =>
          emit(
            "update:modelValue",
            event.target instanceof HTMLInputElement ? event.target.value : "",
          ),
      }),
});

registerDmsComponent("DmsInputNumber", NumberInput);
registerDmsComponent("DmsInputText", TextInput);

const Slot = defineComponent({
  props: { label: { type: String, default: undefined } },
  setup:
    (props, { slots }) =>
    () =>
      h("span", [props.label, slots.default?.()]),
});

const STUBS = [
  "UButton",
  "UIcon",
  "UTooltip",
  "USkeleton",
  "UInput",
  "UKbd",
  "USelect",
  "USelectMenu",
  "UPopover",
  "UCheckbox",
  "DmsStatusPill",
  "DmsMeterBar",
  "DmsSectionHeader",
  "DmsSegmentedControl",
  "DmsSaveBar",
  "DmsSaveStatus",
  "DmsBlockStatus",
  "DmsBlockInlineStatus",
  "DmsEmptyState",
];

const PRICE: MatrixColumn = {
  id: "price",
  label: "Price",
  kind: "number",
  max: 100,
};
const NOTE: MatrixColumn = { id: "note", label: "Note", kind: "text" };

const GRID: MatrixData = {
  columns: [PRICE, NOTE],
  rows: [
    { id: "r1", label: "Desk", values: { price: 40, note: "oak" } },
    { id: "r2", label: "Lamp", values: { price: 43, note: "abc" } },
    { id: "r3", label: "Chair", values: { price: 12, note: "ash" } },
  ],
};

const saves: MatrixSaveRequest[] = [];
const authFetch = vi.fn(
  async (_url: string, options?: { body?: MatrixSaveRequest }) => {
    if (options?.body) saves.push(options.body);
    return {};
  },
);

let unmount: (() => void) | undefined;

/** jsdom lays nothing out: the grid's scroll to the focused cell does nothing. */
Object.defineProperty(Element.prototype, "scrollIntoView", {
  value: () => undefined,
  configurable: true,
});

beforeEach(async () => {
  saves.length = 0;
  vi.stubGlobal("shallowRef", shallowRef);
  await stubBlockRuntime(authFetch);
  useRealDataEngine();
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en-GB"),
    t: (key: string) => key,
    n: String,
  }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn(), remove: vi.fn() }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {}, params: {}, path: "/" }));
  vi.stubGlobal("useDrawer", () => ({ open: vi.fn() }));
  vi.stubGlobal("useModal", () => ({ open: vi.fn() }));
  vi.stubGlobal("useExportJob", () => ({ runJob: vi.fn() }));
  vi.stubGlobal("useClipboard", () => ({ copy: vi.fn() }));
  vi.stubGlobal("useConfirm", () => ({ confirm: vi.fn(async () => true) }));
  vi.stubGlobal("useOverlay", () => ({
    create: () => ({ open: vi.fn(async () => true) }),
  }));
  vi.stubGlobal("useApiErrorPresenter", () => ({
    presentError: vi.fn(),
    resolveError: () => null,
  }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
});

afterEach(() => {
  unmount?.();
  vi.unstubAllGlobals();
});

/** The grid mounted in the page, its cell `rowId` / `columnId` open for editing. */
async function openEditor(rowId: string, columnId: string) {
  const { default: MatrixBlock } = await import(
    "../layers/dms-ui/app/components/blocks/MatrixBlock.vue"
  );
  const { app, container } = mountInBrowser(
    {
      render: () =>
        h(MatrixBlock, {
          componentId: "grid",
          pageId: "products",
          urlState: false,
          saveUrl: "/api/products/grid/save",
          staticData: GRID,
        }),
    },
    (root) => {
      for (const name of STUBS) root.component(name, Slot);
    },
  );
  document.body.append(container);
  unmount = () => {
    app.unmount();
    container.remove();
  };
  const cellOf = (row: string, column: string) =>
    container.querySelector<HTMLElement>(
      `[data-row-id="${row}"][data-column-id="${column}"]`,
    );
  await vi.waitFor(() => expect(cellOf(rowId, columnId)).not.toBeNull());
  cellOf(rowId, columnId)?.click();
  await vi.waitFor(() => {
    expect(document.activeElement?.tagName).toBe("INPUT");
  });
  const input = document.activeElement;
  if (!(input instanceof HTMLInputElement)) throw new Error("no input");
  return { input, cellOf };
}

/** Types `text` over the input's content, as a user does after selecting it. */
async function type(input: HTMLInputElement, text: string): Promise<void> {
  input.value = text;
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
  await nextTick();
}

function press(input: HTMLInputElement, key: string): void {
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

const changesSaved = () =>
  saves.flatMap(({ changes }) =>
    changes.map(({ rowId, columnId, value }) => ({ rowId, columnId, value })),
  );

it.each([
  ["ArrowUp", "r1"],
  ["ArrowDown", "r3"],
])(
  "saves the number typed over 43 as 44 on %s and moves to %s, never stepping it (fails when the arrow commits before the number input takes the typed text, so the edit is lost)",
  async (key, landing) => {
    const { input, cellOf } = await openEditor("r2", "price");

    await type(input, "44");
    press(input, key);

    await vi.waitFor(() =>
      expect(changesSaved()).toEqual([
        { rowId: "r2", columnId: "price", value: 44 },
      ]),
    );
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(cellOf(landing, "price")),
    );
  },
);

it("keeps 43 and moves down on ArrowDown when nothing was typed, rather than stepping the number to 42 or 44 (fails when the arrow reaches the number input, which steps its value)", async () => {
  const { input, cellOf } = await openEditor("r2", "price");

  press(input, "ArrowDown");

  await vi.waitFor(() =>
    expect(document.activeElement).toBe(cellOf("r3", "price")),
  );
  expect(changesSaved()).toEqual([]);
});

it.each([
  ["ArrowUp", "r1"],
  ["ArrowDown", "r3"],
])(
  "saves the text typed in a text cell on %s and moves to %s (fails when the arrow drops a typed text)",
  async (key, landing) => {
    const { input, cellOf } = await openEditor("r2", "note");

    await type(input, "abd");
    press(input, key);

    await vi.waitFor(() =>
      expect(changesSaved()).toEqual([
        { rowId: "r2", columnId: "note", value: "abd" },
      ]),
    );
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(cellOf(landing, "note")),
    );
  },
);

it("keeps the editor open on its input when the arrow meets a number the column refuses, 500 over a maximum of 100, and saves nothing (fails when the refused draft leaves the input without the focus, or is saved)", async () => {
  const { input } = await openEditor("r2", "price");

  await type(input, "500");
  press(input, "ArrowDown");
  await nextTick();

  expect([changesSaved(), document.activeElement === input]).toEqual([
    [],
    true,
  ]);
});
