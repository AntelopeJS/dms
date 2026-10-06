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

const overview = ref({
  email: "admin@example.com",
  isValidated: true,
  hasPassword: true,
});
const refresh = vi.fn(async () => {});
const refreshSession = vi.fn(async () => {});
const authFetch = vi.fn();
const addToast = vi.fn();

// The leave guard needs the app (router, confirm dialog): the dirty state only.
vi.mock(
  "#dms-ui/app/composables/unsaved-changes/useUnsavedChanges",
  async () => {
    const { computed, toValue } = await import("vue");
    return {
      useUnsavedChanges: (options: { dirty: () => boolean }) => ({
        isDirty: computed(() => !!toValue(options.dirty)),
        confirmLeave: async () => true,
      }),
    };
  },
);

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
      errorMessage: (_error: unknown, fallback: string) => fallback,
      errorCode: (error: { data?: unknown } | undefined) => error?.data,
    }),
  }),
);

let app: App;
let host: HTMLDivElement;

const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", [slots.label?.(), slots.default?.(), slots.meta?.()]),
});

const Button = defineComponent({
  props: { label: String, loading: Boolean },
  setup: (props) => () => h("button", { type: "button" }, props.label),
});

const Input = defineComponent({
  inheritAttrs: false,
  props: { modelValue: String },
  emits: ["update:modelValue"],
  setup:
    (props, { attrs, emit, slots }) =>
    () =>
      h("div", [
        h("input", {
          ...attrs,
          value: props.modelValue,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
        }),
        slots.trailing?.(),
      ]),
});

const Collapsible = defineComponent({
  props: { open: Boolean },
  setup:
    (props, { slots }) =>
    () =>
      h("div", props.open ? slots.content?.() : []),
});

const I18nT = defineComponent({
  props: { keypath: String },
  setup:
    (props, { slots }) =>
    () =>
      h("span", { "data-note": "" }, [props.keypath, " ", slots.email?.()]),
});

async function flush(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await nextTick();
}

async function mountEmail(): Promise<void> {
  const { default: SecurityEmail } = await import(
    "../layers/dms-layout/app/build/components/pages/settings/security/SecurityEmail.vue"
  );
  app = createApp(SecurityEmail);
  for (const name of ["DmsSection", "DmsFieldRow", "DmsListRow", "UTooltip"]) {
    app.component(name, Passthrough);
  }
  for (const name of ["UBadge", "USkeleton", "UIcon", "DmsLink"]) {
    app.component(name, defineComponent({ setup: () => () => h("span") }));
  }
  app.component("UButton", Button);
  app.component("UInput", Input);
  app.component("UCollapsible", Collapsible);
  app.component("I18nT", I18nT);
  app.component(
    "DmsBanner",
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h("div", slots.description?.()),
    }),
  );
  app.mount(host);
  await flush();
}

const trigger = () =>
  host.querySelector<HTMLButtonElement>("#security-email-form-trigger");
const form = () => host.querySelector<HTMLFormElement>("#security-email-form");
const emailInput = () =>
  host.querySelector<HTMLInputElement>("#security-new-email");
const passwordInput = () =>
  host.querySelector<HTMLInputElement>("#security-email-current-password");
const submitButton = () =>
  host.querySelector<HTMLButtonElement>("button[type='submit']");
const cancelButton = () =>
  [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "page.settings.security.cancel",
  );

async function type(input: HTMLInputElement | null, value: string) {
  input!.value = value;
  input!.dispatchEvent(new Event("input"));
  await flush();
}

async function openPanel(): Promise<void> {
  trigger()!.click();
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
  vi.stubGlobal("useCurrentUser", () => ({ refresh: refreshSession }));
  vi.stubGlobal("useTranslation", () => ({
    processApiMessage: (message: string) => message,
  }));
  overview.value = {
    email: "admin@example.com",
    isValidated: true,
    hasPassword: true,
  };
  authFetch.mockReset();
  addToast.mockReset();
  refresh.mockClear();
  refreshSession.mockClear();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("opens inline from a collapsed trigger and focuses the new email", async () => {
  await mountEmail();
  expect(form()).toBeNull();
  expect(trigger()?.getAttribute("aria-expanded")).toBe("false");
  expect(trigger()?.getAttribute("aria-controls")).toBe("security-email-form");

  await openPanel();
  expect(form()).not.toBeNull();
  expect(trigger()).toBeNull();
  expect(host.textContent).toContain("page.settings.security.email.editing");
  expect(document.activeElement).toBe(emailInput());
  expect(host.querySelector("[data-note]")?.textContent).toContain(
    "page.settings.security.email.new_placeholder",
  );
});

it("closes on Cancel and Escape, returns focus and resets the form", async () => {
  await mountEmail();
  await openPanel();
  await type(emailInput(), "new@example.com");
  cancelButton()!.click();
  await flush();
  expect(form()).toBeNull();
  expect(document.activeElement).toBe(trigger());

  await openPanel();
  expect(emailInput()?.value).toBe("");
  emailInput()!.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await flush();
  expect(form()).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

it("validates the address inline once the field is left", async () => {
  await mountEmail();
  await openPanel();

  await type(emailInput(), "not-an-email");
  // Not flagged while typing, only once the field is left.
  expect(host.querySelector("#security-new-email-error")).toBeNull();
  emailInput()!.dispatchEvent(new Event("blur"));
  await flush();
  expect(host.querySelector("#security-new-email-error")?.textContent).toBe(
    "page.settings.security.email.invalid",
  );
  expect(emailInput()?.getAttribute("aria-invalid")).toBe("true");
  expect(emailInput()?.getAttribute("aria-describedby")).toBe(
    "security-new-email-error",
  );

  await type(emailInput(), "Admin@Example.com");
  expect(host.querySelector("#security-new-email-error")?.textContent).toBe(
    "page.settings.security.errors.email_unchanged",
  );

  await type(emailInput(), "new@example.com");
  expect(host.querySelector("#security-new-email-error")).toBeNull();
});

it("flags every empty field on submit, focuses the first and sends nothing", async () => {
  await mountEmail();
  await openPanel();
  // Nothing typed, nothing to submit: only Cancel shows.
  expect(submitButton()).toBeFalsy();
  expect(host.querySelector("#security-new-email-error")).toBeNull();

  form()!.dispatchEvent(new Event("submit"));
  await flush();
  expect(authFetch).not.toHaveBeenCalled();
  expect(host.querySelector("#security-new-email-error")?.textContent).toBe(
    "$dms.field_errors.required",
  );
  expect(
    host.querySelector("#security-email-current-password-error")?.textContent,
  ).toBe("$dms.field_errors.required");
  expect(emailInput()?.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(emailInput());

  // Each message goes away once its field is filled.
  await type(emailInput(), "new@example.com");
  expect(submitButton()).toBeTruthy();
  expect(host.querySelector("#security-new-email-error")).toBeNull();
  form()!.dispatchEvent(new Event("submit"));
  await flush();
  expect(document.activeElement).toBe(passwordInput());
  await type(passwordInput(), "secret");
  expect(
    host.querySelector("#security-email-current-password-error"),
  ).toBeNull();
});

it("posts the new address with the current password, then collapses", async () => {
  authFetch.mockResolvedValue({});
  await mountEmail();
  await openPanel();
  await type(emailInput(), "  new@example.com ");
  await type(passwordInput(), "secret");
  form()!.dispatchEvent(new Event("submit"));
  await flush();

  expect(authFetch).toHaveBeenCalledWith("/settings/user/security/email", {
    method: "POST",
    body: { email: "new@example.com", currentPassword: "secret" },
  });
  expect(addToast).toHaveBeenCalledWith({
    title: "page.settings.security.email.updated",
    color: "success",
  });
  expect(refresh).toHaveBeenCalled();
  expect(refreshSession).toHaveBeenCalled();
  expect(form()).toBeNull();
});

it("shows a wrong current password under its field, without a toast", async () => {
  authFetch.mockRejectedValue({
    statusCode: 400,
    data: "error.invalid_current_password",
  });
  await mountEmail();
  await openPanel();
  await type(emailInput(), "new@example.com");
  await type(passwordInput(), "wrong");
  form()!.dispatchEvent(new Event("submit"));
  await flush();

  expect(form()).not.toBeNull();
  expect(
    host.querySelector("#security-email-current-password-error")?.textContent,
  ).toBe("page.settings.security.errors.invalid_current_password");
  expect(document.activeElement).toBe(passwordInput());
  expect(addToast).not.toHaveBeenCalled();

  await type(passwordInput(), "wrong2");
  expect(
    host.querySelector("#security-email-current-password-error"),
  ).toBeNull();
});

it("keeps the trigger disabled for accounts without a password", async () => {
  overview.value = { ...overview.value, hasPassword: false };
  await mountEmail();
  expect(trigger()?.disabled).toBe(true);
});
