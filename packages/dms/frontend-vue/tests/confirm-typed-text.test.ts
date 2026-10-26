/** @vitest-environment jsdom */
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

import { DialogRoot } from "reka-ui";

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
        // SAFETY: This handler is attached to the input created here; dispatched input events target that HTMLInputElement.
        onInput: (event: Event) =>
          emit("update:modelValue", (event.target as HTMLInputElement).value),
      });
  },
});

const Empty = defineComponent({ setup: () => () => null });

async function flush(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await nextTick();
}

function mount(
  props: Partial<InstanceType<typeof ConfirmModal>["$props"]>,
): void {
  app = createApp({
    render: () =>
      h(DialogRoot, null, () => h(ConfirmModal, { onClose: closed, ...props })),
  });
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
    t: (
      key: string,
      params?: Parameters<
        import("../layers/dms-core/app/composables/translation/useTranslation").I18nTranslate
      >[1],
    ) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }));
  vi.stubGlobal("useTranslation", () => ({
    processApiMessage: (message: string) => message,
  }));
  vi.stubGlobal("resolveDmsComponent", () => undefined);
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

it("matches the typed text ignoring case when asked", async () => {
  const onConfirm = vi.fn(async () => undefined);
  mount({
    title: "Delete?",
    confirmLabel: "Delete",
    confirmText: "Acme Corp",
    confirmTextCaseInsensitive: true,
    onConfirm,
  });
  await flush();

  await type("acme corp");
  confirmButton().click();
  await flush();
  expect(typedError()).toBeUndefined();
  expect(onConfirm).toHaveBeenCalledOnce();
});

it("keeps the case-sensitive match by default", async () => {
  const onConfirm = vi.fn(async () => undefined);
  mount({
    title: "Delete?",
    confirmLabel: "Delete",
    confirmText: "Acme Corp",
    onConfirm,
  });
  await flush();

  await type("acme corp");
  confirmButton().click();
  await flush();
  expect(typedError()).toBe('dms.confirm.type_mismatch {"text":"Acme Corp"}');
  expect(onConfirm).not.toHaveBeenCalled();
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
