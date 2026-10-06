// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type App, createApp, defineComponent, h, nextTick, ref } from "vue";

const CELLS = 6;

const PinInput = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Array, length: Number },
  emits: ["update:modelValue", "complete"],
  setup:
    (props, { attrs, emit }) =>
    () =>
      h(
        "div",
        { ...attrs },
        Array.from({ length: props.length ?? CELLS }, (_, index) =>
          h("input", {
            value: (props.modelValue as string[] | undefined)?.[index] ?? "",
            onInput: () => emit("complete"),
          }),
        ),
      ),
});

let app: App | undefined;
let host: HTMLDivElement;

async function mount(props: Record<string, unknown> = {}) {
  const { default: OtpInput } = await import(
    "../layers/dms-ui/app/build/components/form/OtpInput.vue"
  );
  const exposed = ref<{ focus: () => void } | null>(null);
  const onComplete = vi.fn();
  app = createApp({
    setup: () => () =>
      h(OtpInput, { ref: exposed, label: "Code", onComplete, ...props }),
  });
  app.component("UPinInput", PinInput);
  app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
  app.mount(host);
  await nextTick();
  return { exposed, onComplete };
}

const cells = () => [...host.querySelectorAll("input")];

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.useRealTimers();
});

it("names its cells and reports a full code", async () => {
  const { onComplete } = await mount();
  const group = host.querySelector("[role=group]")!;
  expect(group.getAttribute("aria-label")).toBe("Code");
  expect(group.getAttribute("aria-describedby")).toBeNull();

  cells()[0]!.dispatchEvent(new Event("input"));
  expect(onComplete).toHaveBeenCalledOnce();
});

it("describes the cells with a refused code's message", async () => {
  await mount({ error: "Wrong code" });
  const group = host.querySelector("[role=group]")!;
  const errorId = group.getAttribute("aria-describedby")!;
  expect(document.getElementById(errorId)?.textContent).toBe("Wrong code");
  expect(
    host.querySelector("[aria-invalid]")?.getAttribute("aria-invalid"),
  ).toBe("true");
});

it("focuses the first empty cell, once the form gives the cells back", async () => {
  const { exposed } = await mount({ modelValue: ["1", "2"] });
  exposed.value!.focus();
  expect(document.activeElement).not.toBe(cells()[2]);

  vi.runAllTimers();
  expect(document.activeElement).toBe(cells()[2]);
});
