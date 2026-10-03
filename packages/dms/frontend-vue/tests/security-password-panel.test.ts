// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  watch,
  type App,
} from "vue";
import { passwordSchema } from "../layers/dms-ui/app/composables/usePasswordStrength";

const overview = ref({ hasPassword: true, activeSessions: 1 });
const refresh = vi.fn(async () => {});
const authFetch = vi.fn();
const addToast = vi.fn();

vi.mock(
  "../layers/dms-layout/app/composables/settings/security/useSecurityOverview",
  () => ({
    SECURITY_ENDPOINT: "/settings/user/security",
    useSecurityOverview: () => ({ overview, refresh }),
  }),
);
vi.mock(
  "../layers/dms-layout/app/composables/settings/security/useSecurityFormat",
  () => ({
    useSecurityFormat: () => ({
      formatDate: () => "",
      daysSince: () => 0,
      errorMessage: (_error: unknown, fallback: string) => fallback,
    }),
  }),
);
vi.mock("../layers/dms-ui/app/components/check-list/PasswordRules.vue", () => ({
  default: { render: () => null },
}));

let app: App;
let host: HTMLDivElement;

const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", [slots.label?.(), slots.default?.(), slots.meta?.()]),
});

const Button = defineComponent({
  inheritAttrs: false,
  props: { label: String, loading: Boolean, disabled: Boolean },
  setup:
    (props, { attrs }) =>
    () =>
      h(
        "button",
        { type: "button", ...attrs, disabled: props.disabled },
        props.label,
      ),
});

const Input = defineComponent({
  inheritAttrs: false,
  props: { modelValue: String },
  emits: ["update:modelValue", "blur"],
  setup:
    (props, { attrs, emit }) =>
    () =>
      h("input", {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) =>
          emit("update:modelValue", (event.target as HTMLInputElement).value),
        onBlur: () => emit("blur"),
      }),
});

const Collapsible = defineComponent({
  props: { open: Boolean },
  setup:
    (props, { slots }) =>
    () =>
      h("div", props.open ? slots.content?.() : []),
});

async function flush(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await nextTick();
}

const input = (id: string) => host.querySelector<HTMLInputElement>(`#${id}`)!;
const errorOf = (id: string) =>
  host.querySelector(`#${id}-error`)?.textContent?.trim();
const form = () =>
  host.querySelector<HTMLFormElement>("#security-password-form")!;

async function type(id: string, value: string): Promise<void> {
  input(id).value = value;
  input(id).dispatchEvent(new Event("input"));
  await flush();
}

async function submit(): Promise<void> {
  form().dispatchEvent(new Event("submit"));
  await flush();
}

async function mountAndOpen(): Promise<void> {
  const { default: SecurityPassword } = await import(
    "../layers/dms-layout/app/build/components/pages/settings/security/SecurityPassword.vue"
  );
  app = createApp(SecurityPassword);
  for (const name of ["DmsSection", "DmsFieldRow", "DmsListRow", "UTooltip"]) {
    app.component(name, Passthrough);
  }
  for (const name of ["UIcon", "DmsLink", "UCheckbox"]) {
    app.component(name, defineComponent({ setup: () => () => h("span") }));
  }
  app.component("UButton", Button);
  app.component("UInput", Input);
  app.component("UCollapsible", Collapsible);
  app.mount(host);
  await flush();
  host
    .querySelector<HTMLButtonElement>("#security-password-form-trigger")!
    .click();
  await flush();
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("nextTick", nextTick);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: addToast }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useTranslation", () => ({
    processApiMessage: (message: string) => message,
  }));
  vi.stubGlobal("usePasswordStrength", () => ({ passwordSchema }));
  authFetch.mockReset();
  addToast.mockReset();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("flags every empty field on submit, the first one focused, and sends nothing", async () => {
  await mountAndOpen();
  expect(errorOf("security-new-password")).toBeUndefined();

  await submit();
  expect(authFetch).not.toHaveBeenCalled();
  for (const id of [
    "security-current-password",
    "security-new-password",
    "security-confirm-password",
  ]) {
    expect(errorOf(id)).toBe("$dms.field_errors.required");
    expect(input(id).getAttribute("aria-invalid")).toBe("true");
    expect(input(id).getAttribute("aria-describedby")).toBe(`${id}-error`);
  }
  expect(document.activeElement).toBe(input("security-current-password"));
});

it("says why a new password or its confirmation is refused, then clears it", async () => {
  await mountAndOpen();
  await type("security-current-password", "old");
  await type("security-new-password", "weak");
  await type("security-confirm-password", "other");
  await submit();
  expect(authFetch).not.toHaveBeenCalled();
  expect(errorOf("security-current-password")).toBeUndefined();
  expect(errorOf("security-new-password")).toBe(
    "$dms.field_errors.password_rules",
  );
  expect(errorOf("security-confirm-password")).toBe(
    "page.settings.security.password.mismatch",
  );
  expect(document.activeElement).toBe(input("security-new-password"));

  await type("security-new-password", "Abcdefg1!");
  await type("security-confirm-password", "Abcdefg1!");
  expect(errorOf("security-new-password")).toBeUndefined();
  expect(errorOf("security-confirm-password")).toBeUndefined();
});

it("shows nothing before the field is left, then flags it on blur", async () => {
  await mountAndOpen();
  await type("security-new-password", "weak");
  expect(errorOf("security-new-password")).toBeUndefined();
  input("security-new-password").dispatchEvent(new Event("blur"));
  await flush();
  expect(errorOf("security-new-password")).toBe(
    "$dms.field_errors.password_rules",
  );
});

it("shows a wrong current password under its field, without a toast", async () => {
  authFetch.mockRejectedValue({
    statusCode: 400,
    data: "error.invalid_current_password",
  });
  await mountAndOpen();
  await type("security-current-password", "wrong");
  await type("security-new-password", "Abcdefg1!");
  await type("security-confirm-password", "Abcdefg1!");
  await submit();
  expect(authFetch).toHaveBeenCalledOnce();
  expect(errorOf("security-current-password")).toBe(
    "page.settings.security.errors.invalid_current_password",
  );
  expect(document.activeElement).toBe(input("security-current-password"));
  expect(addToast).not.toHaveBeenCalled();

  await type("security-current-password", "wrong2");
  expect(errorOf("security-current-password")).toBeUndefined();
});
