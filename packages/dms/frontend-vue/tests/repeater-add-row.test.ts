// @vitest-environment jsdom
/**
 * A read-only array field shows its rows and nothing to change them with.
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

async function mount(
  rows: Record<string, unknown>[],
  options: { sortable?: boolean; disabled?: boolean } = {},
) {
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
  // What the read-only table of a disabled list reads its cells through.
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
  // A read-only list (a record's details) shows its rows as a table of
  // values, and nothing to change them with.
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
