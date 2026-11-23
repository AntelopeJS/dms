/** @vitest-environment jsdom */
/**
 * A row the user adds starts with the values its columns declare, and so do
 * the rows a field below `min` opens with, which the form reads as its
 * starting value, not a change.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  inject,
  computed,
  watch,
  onBeforeUnmount,
  type App,
} from "vue";
import {
  formBusInjectionKey,
  formFieldInjectionKey,
} from "@nuxt/ui/composables/useFormField";
import type { FormEvent } from "@nuxt/ui";
import { useEventBus } from "@vueuse/core";
import Repeater from "../layers/dms-ui/app/components/form/components/InputRepeater.vue";
import {
  FORM_FIELD_SAVED_KEY,
  type MarkFieldSaved,
} from "../layers/dms-ui/app/composables/form/types/field-saved";
import { registerDmsComponent } from "#dms/frontend-module";
import { defined } from "./helpers/defined";

const Cell = defineComponent({
  props: {
    modelValue: { type: [String, Number], default: undefined },
  },
  emits: ["update:modelValue"],
  setup:
    (props, { emit, attrs }) =>
    () =>
      h("input", {
        id: attrs.id,
        value: props.modelValue ?? "",
        onInput: (event: Event) => {
          if (event.target instanceof HTMLInputElement)
            emit("update:modelValue", event.target.value);
        },
      }),
});
registerDmsComponent("dms-test-cell", Cell);

type Column = InstanceType<typeof Repeater>["$props"]["columns"][number];

const COLUMNS: Column[] = [
  {
    id: "unit",
    component: { componentName: "dms-test-cell" },
    defaultValue: "hour",
  },
  {
    id: "quantity",
    component: { componentName: "dms-test-cell" },
    defaultValue: 1,
  },
  {
    id: "price",
    component: { componentName: "dms-test-cell" },
  },
];

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const Button = defineComponent({
  props: { label: { type: String, default: "" } },
  emits: ["click"],
  setup:
    (props, { emit }) =>
    () =>
      h("button", { onClick: () => emit("click") }, props.label),
});

type Rows = InstanceType<typeof Repeater>["$props"]["modelValue"];

async function mount(
  rows: Rows,
  options: { min?: number; disabled?: boolean } = {},
  columns: Column[] = COLUMNS,
) {
  for (const [name, value] of Object.entries({
    inject,
    computed,
    ref,
    watch,
    onBeforeUnmount,
  })) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  const events: string[] = [];
  const saved: Array<Parameters<MarkFieldSaved>> = [];
  const model = ref<Rows>(rows);
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp({
    render: () =>
      h(Repeater, {
        id: "lines",
        columns,
        modelValue: model.value,
        ...options,
        "onUpdate:modelValue": (next: Rows) => (model.value = next),
      }),
  });
  const bus = useEventBus<FormEvent<object>, string>(Symbol("form-bus"));
  bus.on((event) => events.push(event.type));
  app.provide(formBusInjectionKey, bus);
  app.provide(
    formFieldInjectionKey,
    computed(() => ({ name: "lines", ariaId: "lines-field" })),
  );
  app.provide(FORM_FIELD_SAVED_KEY, (id, value) => saved.push([id, value]));
  app.component("UButton", Button);
  app.component("UIcon", Button);
  app.mount(host);
  await nextTick();
  const addButton = () =>
    defined(
      [...host.querySelectorAll("button")].find(
        (button) => button.textContent === "dms.form.repeater.add",
      ),
    );
  const cell = (row: number, column: string) =>
    defined(
      host.querySelector<HTMLInputElement>(`[id="lines.${row}.${column}"]`),
    );
  return { host, events, saved, model, addButton, cell };
}

describe("a repeater's new rows", () => {
  it("adds a row holding the columns' values, without validating", async () => {
    const { events, model, addButton } = await mount([]);
    addButton().click();
    await nextTick();
    expect(model.value).toEqual([{ unit: "hour", quantity: 1 }]);
    expect(events).toEqual([]);
  });

  it("gives each added row its own copy of a list value", async () => {
    const tags = ["urgent"];
    const { model, addButton } = await mount([], {}, [
      {
        id: "tags",
        component: { componentName: "dms-test-cell" },
        defaultValue: tags,
      },
    ]);
    addButton().click();
    await nextTick();
    addButton().click();
    await nextTick();
    const [first, second] = model.value ?? [];
    expect(first?.tags).toEqual(["urgent"]);
    expect(first?.tags).not.toBe(tags);
    expect(first?.tags).not.toBe(second?.tags);
  });

  it("adds no row to a read-only field below min", async () => {
    const { saved, model } = await mount(undefined, {
      min: 2,
      disabled: true,
    });
    expect(model.value).toBe(undefined);
    expect(saved).toEqual([]);
  });

  it("opens below min with new rows, as the field's starting value", async () => {
    const { events, saved, model } = await mount(undefined, { min: 2 });
    const rows = [
      { unit: "hour", quantity: 1 },
      { unit: "hour", quantity: 1 },
    ];
    expect(model.value).toEqual(rows);
    expect(saved).toEqual([["lines", rows]]);
    expect(events).toEqual([]);
  });

  it("keeps the rows a field opens with when they reach min", async () => {
    const rows = [{ unit: "day", quantity: 3 }];
    const { saved, model } = await mount(rows, { min: 1 });
    expect(model.value).toEqual(rows);
    expect(saved).toEqual([]);
  });

  it("tops up the rows a field opens with to min", async () => {
    const { model } = await mount([{ unit: "day", quantity: 3 }], { min: 2 });
    expect(model.value).toEqual([
      { unit: "day", quantity: 3 },
      { unit: "hour", quantity: 1 },
    ]);
  });
});
