// @vitest-environment jsdom
/**
 * A cell edited in place, as the grid renders it: a click opens its input
 * with the keyboard in it (the control's code loads lazily), the click does
 * not reach the row, Enter saves, Esc cancels.
 */
import {
  computed,
  createApp,
  defineAsyncComponent,
  defineComponent,
  h,
  nextTick,
  ref,
  watch,
  type App,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import InlineEditCell from "../layers/dms-ui/app/build/components/table/InlineEditCell.vue";
import { useTableInlineEdit } from "../layers/dms-ui/app/build/composables/table-view/useTableInlineEdit";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types";

type Row = Record<string, unknown>;
type Api = Parameters<typeof useTableInlineEdit>[0]["api"];

const InputStub = defineComponent({
  inheritAttrs: false,
  props: { id: String, modelValue: { type: null, default: undefined } },
  emits: ["update:modelValue"],
  setup:
    (props, { emit }) =>
    () =>
      h("input", {
        id: props.id,
        value: props.modelValue ?? "",
        onInput: (event: Event) =>
          emit("update:modelValue", (event.target as HTMLInputElement).value),
      }),
});
// Resolved like a DMS control: its code arrives after the cell rendered.
const LazyInput = defineAsyncComponent(
  () =>
    new Promise<typeof InputStub>((resolve) =>
      setTimeout(() => resolve(InputStub), 20),
    ),
);

const IconStub = () => h("i");

let app: App | undefined;
let host: HTMLElement | undefined;

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("resolveDmsComponent", () => LazyInput);
});

afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.unstubAllGlobals();
});

function mountCell(api = vi.fn(async () => ({}))) {
  const rows = ref([{ _id: "p1", name: "Desk" }]);
  const data = ref({
    results: rows.value as Row[],
    total: 1,
    offset: 0,
    limit: 10,
  });
  const inlineEdit = useTableInlineEdit<Row>({
    inlineEdit: true,
    editFields: [
      {
        id: "name",
        type: "string",
        component: { componentName: "dms-input-text", options: {} },
      },
    ],
    columns: [
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        listable: true,
      } as unknown as TableViewColumn,
    ],
    data,
    rowIdKey: "_id",
    labelKey: "name",
    location: "/api/products",
    api: api as unknown as Api,
    getDataType: () => undefined,
    canEditRow: () => true,
    isEnabled: computed(() => true),
    // The row cannot be read again: the value sent stands in for it.
    getRow: async () => undefined,
    onSaved: () => {},
    onError: () => {},
  });
  const onRowClick = vi.fn();
  const cell = () => {
    const original = data.value.results[0]!;
    return {
      row: { original },
      column: {
        id: "name",
        columnDef: {
          cell: () => String(original.name),
          meta: { label: "Name" },
        },
      },
    };
  };
  host = document.createElement("div");
  document.body.append(host);
  app = createApp(() =>
    h("div", { onClick: onRowClick, onDblclick: onRowClick }, [
      h(InlineEditCell as never, { cell: cell(), inlineEdit }),
    ]),
  );
  app.component("UIcon", IconStub);
  app.mount(host);
  return { host, api, onRowClick, data };
}

const displayOf = (root: HTMLElement) =>
  root.querySelector<HTMLElement>("[data-inline-edit='display']")!;

async function openCell(root: HTMLElement): Promise<HTMLInputElement> {
  displayOf(root).click();
  await vi.waitFor(() => expect(document.activeElement?.tagName).toBe("INPUT"));
  return document.activeElement as HTMLInputElement;
}

it("opens on a click with the keyboard in its input, its text selected, without opening the row", async () => {
  const { host, onRowClick } = mountCell();
  const input = await openCell(host);
  expect(input.value).toBe("Desk");
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]);
  expect(document.querySelector("label.sr-only")?.textContent).toBe(
    "dms.table.inline_edit.cell",
  );
  input.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  expect(onRowClick).not.toHaveBeenCalled();
});

it("saves on Enter and gives the keyboard back to the cell", async () => {
  const { host, api, data } = mountCell();
  const input = await openCell(host);
  input.value = "Standing desk";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await vi.waitFor(() =>
    expect(api).toHaveBeenCalledWith("/api/products/edit", {
      method: "PUT",
      query: { id: "p1" },
      body: { name: "Standing desk" },
    }),
  );
  await vi.waitFor(() => expect(document.activeElement).toBe(displayOf(host)));
  expect(data.value.results[0]?.name).toBe("Standing desk");
});

it("cancels on Esc without a request", async () => {
  const { host, api } = mountCell();
  const input = await openCell(host);
  input.value = "Typo";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await nextTick();
  await vi.waitFor(() => expect(document.activeElement).toBe(displayOf(host)));
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(api).not.toHaveBeenCalled();
  expect(host.querySelector("input")).toBe(null);
});
