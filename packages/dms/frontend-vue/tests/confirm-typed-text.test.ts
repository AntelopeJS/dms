// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
} from "vue";
import ConfirmModal from "../layers/dms-ui/app/components/confirm/ConfirmModal.vue";

// The modal's title and description need a reka DialogRoot: plain text here.
vi.mock("reka-ui", async () => {
  const { defineComponent: define, h: render } = await import("vue");
  const Text = define({
    setup:
      (_, { slots }) =>
      () =>
        render("div", slots.default?.()),
  });
  return { DialogTitle: Text, DialogDescription: Text };
});

let app: App | undefined;
let host: HTMLDivElement;
const closed = vi.fn();

const Slots = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", [slots.header?.(), slots.body?.(), slots.footer?.()]),
});

const Button = defineComponent({
  props: { label: String, disabled: Boolean },
  emits: ["click"],
  setup:
    (props, { emit }) =>
    () =>
      h(
        "button",
        { disabled: props.disabled, onClick: () => emit("click") },
        props.label,
      ),
});

// The UFormField contract the typed check relies on: its error marks the
// input and shows under it.
const FormField = defineComponent({
  props: { error: String },
  setup:
    (props, { slots }) =>
    () =>
      h("div", [
        slots.default?.(),
        props.error ? h("p", { "data-error": "" }, props.error) : null,
      ]),
});

const Input = defineComponent({
  props: { modelValue: String },
  emits: ["update:modelValue"],
  setup(props, { emit, expose }) {
    const inputRef = ref<HTMLInputElement>();
    expose({
      get inputRef() {
        return inputRef.value;
      },
    });
    return () =>
      h("input", {
        ref: inputRef,
        value: props.modelValue,
        onInput: (event: Event) =>
          emit("update:modelValue", (event.target as HTMLInputElement).value),
      });
  },
});

const Empty = defineComponent({ setup: () => () => null });

async function flush(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await nextTick();
}

function mount(props: Record<string, unknown>): void {
  app = createApp(ConfirmModal, { onClose: closed, ...props });
  app.config.globalProperties.$t = (key: string) => key;
  app.component("UModal", Slots);
  app.component("UButton", Button);
  app.component("UFormField", FormField);
  app.component("UInput", Input);
  for (const name of ["UIcon", "UKbd", "UAlert", "I18nT", "DmsIconWell"]) {
    app.component(name, Empty);
  }
  app.mount(host);
}

const confirmButton = () =>
  [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Delete",
  )!;
const typedInput = () => host.querySelector("input")!;
const typedError = () => host.querySelector("[data-error]")?.textContent;

async function type(value: string): Promise<void> {
  typedInput().value = value;
  typedInput().dispatchEvent(new Event("input"));
  await flush();
}

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }));
  host = document.createElement("div");
  document.body.append(host);
  closed.mockReset();
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

it("flags an empty or different typed text instead of disabling confirm", async () => {
  const onConfirm = vi.fn(async () => undefined);
  mount({
    title: "Delete?",
    description: "Gone for good",
    confirmLabel: "Delete",
    confirmText: "admin@example.com",
    onConfirm,
  });
  await flush();
  expect(confirmButton().disabled).toBe(false);
  expect(typedError()).toBeUndefined();

  confirmButton().click();
  await flush();
  expect(typedError()).toBe("dms.field_errors.required");
  expect(document.activeElement).toBe(typedInput());
  expect(onConfirm).not.toHaveBeenCalled();

  // Typing clears it; a wrong text is a mismatch.
  await type("admin@");
  expect(typedError()).toBeUndefined();
  confirmButton().click();
  await flush();
  expect(typedError()).toBe(
    'dms.confirm.type_mismatch {"text":"admin@example.com"}',
  );
  expect(onConfirm).not.toHaveBeenCalled();

  await type(" admin@example.com ");
  confirmButton().click();
  await flush();
  expect(onConfirm).toHaveBeenCalledOnce();
  expect(closed).toHaveBeenCalledWith(true);
});

it("runs the body check with the typed one and stays open when it fails", async () => {
  const validate = vi.fn(() => false);
  const onConfirm = vi.fn(async () => undefined);
  mount({
    title: "Delete?",
    description: "Gone for good",
    confirmLabel: "Delete",
    confirmText: "DELETE",
    validate,
    onConfirm,
  });
  await flush();

  confirmButton().click();
  await flush();
  expect(validate).toHaveBeenCalledOnce();
  // Both fields are flagged at once; the body one keeps the focus.
  expect(typedError()).toBe("dms.field_errors.required");
  expect(document.activeElement).not.toBe(typedInput());
  expect(onConfirm).not.toHaveBeenCalled();
  expect(closed).not.toHaveBeenCalled();

  validate.mockReturnValue(true);
  await type("DELETE");
  confirmButton().click();
  await flush();
  expect(onConfirm).toHaveBeenCalledOnce();
});
