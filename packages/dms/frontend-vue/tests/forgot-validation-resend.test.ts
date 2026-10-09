// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  reactive,
  ref,
  watch,
  type App,
} from "vue";

// The password-reset code page: a new code starts clean, without the refusal
// of the previous one.

vi.mock("#dms-ui/app/build/components/form/OtpInput.vue", async () => {
  const { defineComponent: define, h: render } = await import("vue");
  return {
    default: define({
      props: { modelValue: Array, error: String },
      emits: ["update:modelValue"],
      setup: (props, { emit, expose }) => {
        expose({ focus: () => undefined });
        return () =>
          render("div", [
            render("input", {
              "data-testid": "code",
              onInput: (event: Event) =>
                emit(
                  "update:modelValue",
                  (event.target as HTMLInputElement).value.split(""),
                ),
            }),
            render("p", { "data-testid": "code-error" }, props.error ?? ""),
          ]);
      },
    }),
  };
});
vi.mock(
  "../layers/dms-layout/app/build/components/layout/StageCard.vue",
  async () => {
    const { defineComponent: define, h: render } = await import("vue");
    return {
      default: define({
        setup:
          (_, { slots }) =>
          () =>
            render("section", slots.default?.()),
      }),
    };
  },
);
vi.mock(
  "../layers/dms-auth/app/build/components/AuthBackLink.vue",
  async () => {
    const { defineComponent: define, h: render } = await import("vue");
    return { default: define({ setup: () => () => render("span") }) };
  },
);

const { default: ForgotValidationPage } = await import(
  "../layers/dms-auth/app/custom-pages/auth/forgot-validation.vue"
);

const WRONG_CODE = "ABC123";
const CODE_REFUSAL = {
  statusCode: 400,
  data: "error.invalid_or_expired_token",
};
const RATE_LIMITED = { statusCode: 429, data: "error.rate_limited" };

let app: App;
let host: HTMLDivElement;
const authFetch = vi.fn();
const toastAdd = vi.fn();

const Form = defineComponent({
  props: { state: { type: Object, required: true } },
  emits: ["submit"],
  setup: (props, { emit, expose, slots }) => {
    const submit = () => emit("submit", { data: props.state });
    expose({ submit });
    return () =>
      h(
        "form",
        {
          onSubmit: (event: Event) => {
            event.preventDefault();
            submit();
          },
        },
        slots.default?.(),
      );
  },
});

const Alert = defineComponent({
  props: { title: String, description: String },
  setup: (props) => () =>
    h("div", { "data-testid": "form-error" }, props.title),
});

const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("span", slots.default?.()),
});

function installRuntime() {
  Object.entries({ computed, ref, reactive, watch, onMounted }).forEach(
    ([key, value]) => vi.stubGlobal(key, value),
  );
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useTranslation", () => ({
    processApiMessage: (message: string) => message,
  }));
  vi.stubGlobal("useToast", () => ({ add: toastAdd }));
  vi.stubGlobal("useDmsApp", () => ({
    runWithContext: (fn: () => unknown) => fn(),
  }));
  vi.stubGlobal("useDmsRoute", () => ({
    query: { email: "member@local.test" },
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("navigateDms", vi.fn());
  // The resend link shows at once: the wait is not under test.
  vi.stubGlobal("useCooldown", () => ({
    cooldown: ref(0),
    startCooldown: vi.fn(),
  }));
}

function mountPage() {
  app = createApp(ForgotValidationPage);
  app.config.globalProperties.$t = (key: string) => key;
  app.component("UForm", Form);
  app.component("UAlert", Alert);
  app.component("UButton", Passthrough);
  app.component("i18n-t", Passthrough);
  app.mount(host);
}

async function settle() {
  for (let tick = 0; tick < 5; tick++) {
    await Promise.resolve();
    await nextTick();
  }
}

const codeError = () =>
  host.querySelector('[data-testid="code-error"]')?.textContent ?? "";
const formError = () => host.querySelector('[data-testid="form-error"]');

function resendButton(): HTMLButtonElement {
  const button = [...host.querySelectorAll("button")].find(
    (entry) => entry.textContent?.trim() === "page.auth.code.resend",
  );
  if (!button) throw new Error("No resend link");
  return button;
}

async function typeCode(code: string) {
  const input = host.querySelector<HTMLInputElement>('[data-testid="code"]')!;
  input.value = code;
  input.dispatchEvent(new Event("input"));
  await settle();
}

async function resend() {
  resendButton().click();
  await settle();
}

beforeEach(() => {
  authFetch.mockReset();
  toastAdd.mockReset();
  installRuntime();
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("drops the refusal of the previous code once a new one is sent", async () => {
  authFetch.mockRejectedValueOnce(CODE_REFUSAL);
  mountPage();
  await typeCode(WRONG_CODE);
  expect(codeError()).not.toBe("");

  authFetch.mockResolvedValueOnce(undefined);
  await resend();

  expect(authFetch).toHaveBeenLastCalledWith("/api/auth/forgot-password", {
    method: "POST",
    body: { email: "member@local.test" },
  });
  expect(toastAdd).toHaveBeenCalledWith(
    expect.objectContaining({ color: "success" }),
  );
  expect(codeError()).toBe("");
});

it("drops a refused resend's alert once a new code is sent", async () => {
  mountPage();
  authFetch.mockRejectedValueOnce(RATE_LIMITED);
  await resend();
  expect(formError()).not.toBe(null);

  authFetch.mockResolvedValueOnce(undefined);
  await resend();

  expect(formError()).toBe(null);
});

it("keeps the refusal of the code when the new one could not be sent", async () => {
  authFetch.mockRejectedValueOnce(CODE_REFUSAL);
  mountPage();
  await typeCode(WRONG_CODE);
  const refusal = codeError();

  authFetch.mockRejectedValueOnce(RATE_LIMITED);
  await resend();

  expect(codeError()).toBe(refusal);
  expect(formError()).not.toBe(null);
});
