/** @vitest-environment jsdom */
/**
 * A row added to an array field is empty: it is checked once its cells are
 * filled or the form is submitted, never flagged "required" the moment it
 * appears. Changing, moving or removing a row validates the field as before.
 *
 * A read-only array field shows its rows and nothing to change them with.
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
import Repeater from "../layers/dms-ui/app/components/form/components/Repeater.vue";
import { registerDmsComponent } from "#dms/frontend-module";

registerDmsComponent(
  "dms-input-text",
  defineComponent({
    props: { modelValue: String },
    setup: (props) => () => h("input", { value: props.modelValue }),
  }),
);

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

async function mount(
  rows: { name?: string }[],
  options: { sortable?: boolean; disabled?: boolean } = {},
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
  const model = ref(rows);
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp({
    render: () =>
      h(Repeater, {
        columns: [
          {
            id: "name",
            required: true,
            component: { componentName: "dms-input-text" },
          },
        ],
        modelValue: model.value,
        ...options,
        "onUpdate:modelValue": (next: typeof rows) => (model.value = next),
      }),
  });
  // SAFETY: Repeater only emits field events through this bus; no other emitter methods are used.
  app.provide(formBusInjectionKey, {
    emit: (event: { type: string }) => events.push(event.type),
  } as never);
  // SAFETY: Repeater reads only the field ref's name; this fixture does not require the computed ref's internal metadata.
  app.provide(
    formFieldInjectionKey,
    ref({
      name: "contacts",
    }) as typeof formFieldInjectionKey extends import("vue").InjectionKey<
      infer Field
    >
      ? Field
      : never,
  );
  app.component("UButton", Button);
  app.component("UIcon", Button);
  app.mount(host);
  await nextTick();
  return { host, events, model };
}

describe("an array field's rows", () => {
  it("adds an empty row without validating the field", async () => {
    const { host, events, model } = await mount([]);
    host.querySelector<HTMLButtonElement>("button:last-of-type")!.click();
    await nextTick();
    expect(model.value).toEqual([{}]);
    expect(events).toEqual([]);
  });

  it("validates once a row is removed", async () => {
    const { host, events } = await mount([{ name: "a" }, { name: "b" }]);
    host.querySelector<HTMLButtonElement>("button")!.click();
    await nextTick();
    expect(events).toEqual(["change"]);
  });

  it("shows only the rows' values when disabled", async () => {
    const { host } = await mount([{ name: "a" }, { name: "b" }], {
      sortable: true,
      disabled: true,
    });
    expect(host.querySelectorAll("input")).toHaveLength(0);
    expect(host.querySelectorAll("button")).toHaveLength(0);
    const cells = [...host.querySelectorAll("tbody td")];
    expect(cells.map((cell) => cell.textContent?.trim())).toEqual(["a", "b"]);
  });
});
