// @vitest-environment jsdom
/**
 * A row added to an array field is empty: it is checked once its cells are
 * filled or the form is submitted, never flagged "required" the moment it
 * appears. Changing, moving or removing a row validates the field as before.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as vue from "vue";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import {
  formBusInjectionKey,
  formFieldInjectionKey,
} from "@nuxt/ui/composables/useFormField";
import Repeater from "../layers/dms-ui/app/components/form/components/Repeater.vue";

vi.mock("../layers/dms-ui/app/composables/resolveDmsComponent", () => ({
  resolveDmsComponent: () => "input",
}));

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

async function mount(rows: Record<string, unknown>[]) {
  // Auto-imports of the layer.
  for (const name of [
    "inject",
    "computed",
    "ref",
    "watch",
    "onBeforeUnmount",
  ]) {
    vi.stubGlobal(name, vue[name as keyof typeof vue]);
  }
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
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
        "onUpdate:modelValue": (next: Record<string, unknown>[]) =>
          (model.value = next),
      }),
  });
  app.provide(formBusInjectionKey, {
    emit: (event: { type: string }) => events.push(event.type),
  } as never);
  app.provide(formFieldInjectionKey, ref({ name: "contacts" }) as never);
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
});
