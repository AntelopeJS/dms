// @vitest-environment jsdom
import {
  type App,
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  watch,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The password dialog asked before a two-factor method is added: it sends the
// password once typed, flags an empty one, and shows the API's refusal.

const FIELD_ID = "security-confirm-current-password";

let app: App;
let host: HTMLDivElement;
const confirmed: string[] = [];
const refusal = ref<string>();

const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", [slots.header?.(), slots.body?.(), slots.default?.()]),
});

const Input = defineComponent({
  inheritAttrs: false,
  props: { modelValue: String },
  emits: ["update:modelValue"],
  setup:
    (props, { attrs, emit }) =>
    () =>
      h("input", {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) =>
          emit("update:modelValue", (event.target as HTMLInputElement).value),
      }),
});

async function flush(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await nextTick();
}

const input = () => host.querySelector<HTMLInputElement>(`#${FIELD_ID}`)!;
const errorText = () =>
  host.querySelector(`#${FIELD_ID}-error`)?.textContent?.trim();

async function submit(): Promise<void> {
  host.querySelector("form")!.dispatchEvent(new Event("submit"));
  await flush();
}

async function mount(): Promise<void> {
  const { default: SecurityPasswordModal } = await import(
    "../layers/dms-layout/app/build/components/pages/settings/security/SecurityPasswordModal.vue"
  );
  app = createApp(() =>
    h(SecurityPasswordModal, {
      open: true,
      error: refusal.value,
      "onUpdate:error": (value: string | undefined) => (refusal.value = value),
      title: "Add authenticator",
      description: "Confirm your password",
      icon: "i-ph-shield-check",
      confirmLabel: "Continue",
      onConfirm: (password: string) => confirmed.push(password),
    }),
  );
  for (const name of ["UModal", "DmsIconWell", "UKbd", "UButton", "UIcon"]) {
    app.component(name, Passthrough);
  }
  app.component("DmsLink", Passthrough);
  app.component("UInput", Input);
  app.mount(host);
  await flush();
}

beforeEach(() => {
  confirmed.length = 0;
  refusal.value = undefined;
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useTranslation", () => ({
    processApiMessage: (message: string) => message,
  }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("flags an empty password and sends nothing", async () => {
  await mount();
  await submit();
  expect(confirmed).toEqual([]);
  expect(errorText()).toBe("$dms.field_errors.required");
});

it("sends the typed password", async () => {
  await mount();
  input().value = "Current1!";
  input().dispatchEvent(new Event("input"));
  await submit();
  expect(confirmed).toEqual(["Current1!"]);
});

it("shows the API's refusal under the field, until the password changes", async () => {
  await mount();
  refusal.value = "Wrong password";
  await flush();
  expect(errorText()).toBe("Wrong password");
  input().value = "Other1!";
  input().dispatchEvent(new Event("input"));
  await flush();
  expect(errorText()).toBeUndefined();
});
