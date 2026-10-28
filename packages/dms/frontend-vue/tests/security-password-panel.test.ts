/** @vitest-environment jsdom */
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
import { usePasswordStrength } from "../layers/dms-ui/app/composables/usePasswordStrength";
import { browserRuntime, stubApiData } from "./helpers/api-data-runtime";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";
import type { useAuthFetch } from "../layers/dms-core/app/composables/auth/useAuthFetch";

const overview = ref({ hasPassword: true, activeSessions: 1 });
const authFetch = vi.fn();
const addToast = vi.fn();
const sessionFetch = vi.fn(async () => {});
const handoffFetch = vi.fn(async () => ({}));

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
  setup: (props, { attrs, emit }) => {
    const input = ref<HTMLInputElement>();
    return () =>
      h("input", {
        ...attrs,
        ref: input,
        value: props.modelValue,
        onInput: () => emit("update:modelValue", input.value!.value),
        onBlur: () => emit("blur"),
      });
  },
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
  await new Promise((resolve) => setTimeout(resolve));
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
    "../layers/dms-layout/app/entries/components/pages/settings/security/SecurityPassword"
  );
  app = createApp(SecurityPassword);
  app.config.globalProperties.$t = (key: string) => key;
  browserRuntime(app);
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
  installAuthSettingsRuntime();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("nextTick", nextTick);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en"),
    te: () => false,
  }));
  vi.stubGlobal("useToast", () => ({ add: addToast }));
  stubApiData(
    async (
      url: string,
      options?: Parameters<ReturnType<typeof useAuthFetch>["$authFetch"]>[1],
    ) =>
      url === "/dms/pages/settings/user/security"
        ? { ...overview.value }
        : authFetch(url, options),
  );
  vi.stubGlobal("$fetch", handoffFetch);
  vi.stubGlobal("useDmsUserSession", () => ({
    session: ref({ accountId: "old-account" }),
    user: ref(null),
    fetch: sessionFetch,
  }));
  vi.stubGlobal("useTranslation", () => ({
    processApiMessage: (message: string) => message,
  }));
  vi.stubGlobal("usePasswordStrength", usePasswordStrength);
  authFetch.mockReset();
  addToast.mockReset();
  handoffFetch.mockClear();
  sessionFetch.mockClear();
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

it("keeps this device signed in through the handoff the change sends back", async () => {
  const sessionHandoff = {
    endpoint: "/api/auth/session-handoff",
    payload: { token: "handoff" },
  };
  authFetch.mockResolvedValue({
    passwordChangedAt: "2026-10-06T10:00:00.000Z",
    signedOutSessions: 2,
    sessionHandoff,
  });
  await mountAndOpen();
  await type("security-current-password", "Current1!");
  await type("security-new-password", "Abcdefg1!");
  await type("security-confirm-password", "Abcdefg1!");
  await submit();
  expect(authFetch.mock.calls[0]?.[1]?.body).toEqual({
    currentPassword: "Current1!",
    password: "Abcdefg1!",
  });
  expect(handoffFetch).toHaveBeenCalledWith("/auth/establish", {
    method: "POST",
    body: sessionHandoff,
  });
  expect(handoffFetch).toHaveBeenCalledWith("/auth/remove-account", {
    method: "POST",
    body: { accountId: "old-account" },
  });
  expect(sessionFetch).toHaveBeenCalledOnce();
});
