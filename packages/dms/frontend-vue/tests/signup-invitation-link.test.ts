// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  reactive,
  ref,
  type App,
} from "vue";
import * as z from "zod";
import SignupPage from "../layers/dms-auth/app/custom-pages/auth/signup.vue";

const route = reactive<{ query: Record<string, unknown> }>({ query: {} });
let app: App;
let host: HTMLDivElement;

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
  Object.entries({ computed, ref, reactive }).forEach(([key, value]) =>
    vi.stubGlobal(key, value),
  );
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB") }));
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { mustValidateEmail: false } },
  }));
  vi.stubGlobal("useHomepage", () => "/");
  vi.stubGlobal("useDmsRoute", () => route);
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

beforeEach(() => {
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
  },
);

it("shows the signup form for an invitation link with its token", () => {
  mountSignup({ token: "invite-token", email: "new@local.test" });
  expect(host.querySelector('[data-testid="signup-invalid-invitation"]')).toBe(
    null,
  );
  expect(host.textContent).toContain("page.signup.create_account_title");
});
