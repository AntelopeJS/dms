// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  nextTick,
  defineComponent,
  h,
  reactive,
  ref,
  watchEffect,
  type App,
} from "vue";
import * as z from "zod";
import SignupPage from "../layers/dms-auth/app/custom-pages/auth/signup.vue";

const route = reactive<{ query: Record<string, unknown> }>({ query: {} });
let app: App;
let host: HTMLDivElement;
const locale = ref("en");
const setLocale = vi.fn(async (code: string) => {
  locale.value = code;
});
const authFetch = vi.fn();
const FORM_TITLE = "page.signup.create_account_title";

const Passthrough = defineComponent({
  inheritAttrs: false,
  setup:
    (_, { attrs, slots }) =>
    () =>
      h("div", { "data-testid": attrs["data-testid"] }, slots.default?.()),
});

const LinkButton = defineComponent({
  props: { label: String, to: String },
  setup: (props) => () => h("a", { href: props.to }, props.label),
});

function installRuntime() {
  Object.entries({ computed, ref, reactive, watchEffect }).forEach(
    ([key, value]) => vi.stubGlobal(key, value),
  );
  vi.stubGlobal("useI18n", () => ({
    locale,
    locales: ref([{ code: "en" }, { code: "fr" }]),
    setLocale,
  }));
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { mustValidateEmail: false } },
  }));
  vi.stubGlobal("useHomepage", () => "/");
  vi.stubGlobal("useDmsApp", () => ({
    runWithContext: (fn: () => unknown) => fn(),
  }));
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("passwordSchema", z.string());
  vi.stubGlobal("usePasswordStrength", () => ({
    strength: ref([]),
    score: ref(0),
    color: ref("error"),
  }));
}

function mountSignup(query: Record<string, unknown>) {
  route.query = query;
  app = createApp(SignupPage);
  app.config.globalProperties.$t = (key: string) => key;
  for (const name of [
    "DmsCard",
    "UIcon",
    "UForm",
    "UFormField",
    "UInput",
    "DmsOAuthButtons",
    "DmsPasswordStrength",
    "DmsLink",
  ]) {
    app.component(name, Passthrough);
  }
  app.component("UButton", LinkButton);
  app.mount(host);
}

/** Let the invitation check the page starts on mount settle. */
async function settle() {
  await Promise.resolve();
  await nextTick();
}

function refusal(code: string) {
  return { statusCode: 400, data: code };
}

beforeEach(() => {
  locale.value = "en";
  setLocale.mockClear();
  authFetch.mockReset();
  authFetch.mockResolvedValue(undefined);
  installRuntime();
  host = document.createElement("div");
});
afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it.each([{}, { token: "" }, { token: ["a", "b"] }])(
  "explains an invitation link without its token (%o)",
  (query) => {
    expect(() => mountSignup(query)).not.toThrow();
    expect(
      host.querySelector('[data-testid="signup-invalid-invitation"]'),
    ).not.toBe(null);
    expect(host.textContent).toContain(
      "page.signup.invalid_invitation_description",
    );
    expect(host.querySelector('a[href="/auth"]')?.textContent).toBe(
      "button.login",
    );
    expect(authFetch).not.toHaveBeenCalled();
  },
);

it("shows the signup form once the server accepts the invitation", async () => {
  mountSignup({ token: "invite-token", email: "new@local.test" });
  expect(
    host.querySelector('[data-testid="signup-checking-invitation"]'),
  ).not.toBe(null);
  expect(host.textContent).not.toContain("page.signup.submit");

  await settle();

  expect(authFetch).toHaveBeenCalledWith("/api/auth/validate-invite-token", {
    method: "POST",
    body: { token: "invite-token", email: "new@local.test" },
  });
  expect(host.querySelector('[data-testid="signup-invalid-invitation"]')).toBe(
    null,
  );
  expect(host.textContent).toContain(FORM_TITLE);
  expect(host.textContent).toContain("page.signup.submit");
});

it.each([
  ["error.invite_revoked", "page.signup.invitation_revoked"],
  ["error.invite_replaced", "page.signup.invitation_replaced"],
  ["error.invite_expired", "page.signup.invitation_expired"],
  ["error.invite_used", "page.signup.invitation_used"],
  ["error.invalid_token", "page.signup.invalid_invitation"],
])(
  "says why a refused invitation link (%s) cannot sign up, instead of the form",
  async (code, notice) => {
    authFetch.mockRejectedValue(refusal(code));
    mountSignup({ token: "stale-token", email: "new@local.test" });

    await settle();

    expect(
      host.querySelector('[data-testid="signup-invalid-invitation"]'),
    ).not.toBe(null);
    expect(host.textContent).toContain(`${notice}_title`);
    expect(host.textContent).toContain(`${notice}_description`);
    expect(host.textContent).not.toContain("page.signup.submit");
    expect(host.querySelector('a[href="/auth"]')?.textContent).toBe(
      "button.login",
    );
  },
);

// A check that could not run proves nothing: the signup itself still refuses
// a stale invitation, so the form stays usable.
it("keeps the form when the invitation check fails for another reason", async () => {
  authFetch.mockRejectedValue({ statusCode: 500 });
  mountSignup({ token: "invite-token", email: "new@local.test" });

  await settle();

  expect(host.querySelector('[data-testid="signup-invalid-invitation"]')).toBe(
    null,
  );
  expect(host.textContent).toContain("page.signup.submit");
});

it("opens in the language the invitation was written in", () => {
  mountSignup({ token: "invite-token", email: "new@local.test", lang: "fr" });
  expect(setLocale).toHaveBeenCalledWith("fr");
  expect(locale.value).toBe("fr");
});

it.each([{}, { lang: "en" }, { lang: "de" }, { lang: ["fr", "en"] }])(
  "keeps the current language for an invitation link carrying %o",
  (query) => {
    mountSignup({ token: "invite-token", email: "new@local.test", ...query });
    expect(setLocale).not.toHaveBeenCalled();
    expect(locale.value).toBe("en");
  },
);
