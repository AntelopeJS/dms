/**
 * A Matrix block mounted in the page as a user drives it: its inputs are
 * test doubles registered under the DMS names, its save route answers what
 * the test says, and every save request is kept.
 */
import { defineComponent, h, nextTick, ref, shallowRef } from "vue";
import { NumberFieldInput, NumberFieldRoot } from "reka-ui";
import { vi } from "vitest";
import { registerDmsComponent } from "#dms/frontend-module";
import { useRealDataEngine } from "../fixtures/dataEngine";
import { mountInBrowser, type ApiAnswer } from "./api-data-runtime";
import { stubBlockRuntime } from "./block-runtime";
import type {
  MatrixOptions,
  MatrixSaveRequest,
} from "../../layers/dms-ui/app/types/matrix";

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

/** jsdom lays nothing out: the grid's scroll to the focused cell does nothing. */
Object.defineProperty(Element.prototype, "scrollIntoView", {
  value: () => undefined,
  configurable: true,
});

/** The query a read of `fetchUrl` is sent with. */
export type MatrixReadQuery = Readonly<Record<string, string>> | undefined;

/** What a request of the grid carries: a save's body, a read's query. */
interface MatrixRequest {
  body?: MatrixSaveRequest;
  query?: MatrixReadQuery;
}

/**
 * Stubs the runtime a Matrix block reads, its save route answering `answer`
 * for each request and its `fetchUrl` answering `read`, and returns the
 * save requests it receives.
 */
export async function stubMatrixRuntime(
  answer: () => ApiAnswer = () => ({}),
  read: (query: MatrixReadQuery) => ApiAnswer = () => ({}),
): Promise<MatrixSaveRequest[]> {
  const saves: MatrixSaveRequest[] = [];
  const authFetch = vi.fn(async (_url: string, options?: MatrixRequest) => {
    if (!options?.body) return read(options?.query);
    saves.push(options.body);
    return answer();
  });
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
  return saves;
}

/** The grid of `options` mounted in the page, and how to reach its cells. */
export async function mountMatrix(options: MatrixOptions) {
  const { default: MatrixBlock } = await import(
    "../../layers/dms-ui/app/components/blocks/MatrixBlock.vue"
  );
  const { app, container } = mountInBrowser(
    {
      render: () =>
        h(MatrixBlock, {
          componentId: "grid",
          pageId: "products",
          urlState: false,
          ...options,
        }),
    },
    (root) => {
      for (const name of STUBS) root.component(name, Slot);
    },
  );
  document.body.append(container);
  const cellOf = (row: string, column: string) =>
    container.querySelector<HTMLElement>(
      `[data-row-id="${row}"][data-column-id="${column}"]`,
    );
  /** Opens the cell's editor with a click, the keyboard in its input. */
  const openEditor = async (rowId: string, columnId: string) => {
    await vi.waitFor(() => {
      if (!cellOf(rowId, columnId)) throw new Error("no such cell yet");
    });
    cellOf(rowId, columnId)?.click();
    await vi.waitFor(() => {
      if (document.activeElement?.tagName !== "INPUT")
        throw new Error("no input open yet");
    });
    const input = document.activeElement;
    if (!(input instanceof HTMLInputElement)) throw new Error("no input");
    return input;
  };
  const unmount = () => {
    app.unmount();
    container.remove();
  };
  return { cellOf, openEditor, unmount };
}

/** Types `text` over the input's content, as a user does after selecting it. */
export async function typeInto(
  input: HTMLInputElement,
  text: string,
): Promise<void> {
  input.value = text;
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
  await nextTick();
}

/** Presses `key` in the input, as the keyboard does. */
export function press(input: HTMLInputElement, key: string): void {
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}
