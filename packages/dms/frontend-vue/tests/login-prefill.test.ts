/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as vue from "vue";
import Form from "@nuxt/ui/components/Form.vue";
import FormField from "@nuxt/ui/components/FormField.vue";
import Input from "@nuxt/ui/components/Input.vue";
import Checkbox from "@nuxt/ui/components/Checkbox.vue";
import Button from "@nuxt/ui/components/Button.vue";
import { browserRuntime, engine } from "./helpers/api-data-runtime";
import Login from "../layers/dms-auth/app/custom-pages/auth/login.vue";

type LoginPrefill = NonNullable<
  ReturnType<typeof engine.useDmsRuntimeConfig>["public"]["dms"]["loginPrefill"]
>;

const fetch = vi.fn();
let app: vue.App;
let host: HTMLDivElement;
const metaTitle = vue.ref("");

beforeEach(() => {
  fetch.mockReset();
  for (const [name, value] of Object.entries({ ...vue, ...engine }))
    vi.stubGlobal(name, value);
  vi.stubGlobal("$fetch", fetch);
  vi.stubGlobal("useHomepage", () => "/");
  vi.stubGlobal("useAuthLinks", () => ({ links: vue.ref([]) }));
  vi.stubGlobal("useSystemState", () => ({ metaTitle }));
  vi.stubGlobal("useOAuthErrorToast", () => {});
  vi.stubGlobal("isFromAccountsList", () => false);
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

async function mount(prefill?: LoginPrefill) {
  app = vue.createApp(Login);
  browserRuntime(app);
  app.runWithContext(() => {
    engine.useDmsRuntimeConfig().public.dms = {
      baseURL: "https://api.test",
      loginPrefill: prefill,
    };
    engine.updateDmsAppConfig([
      { module: "login-test", config: { ui: { icons: {} } } },
    ]);
  });
  app.config.globalProperties.$t = (key: string) => key;
  for (const [name, component] of Object.entries({
    UForm: Form,
    UFormField: FormField,
    UInput: Input,
    UCheckbox: Checkbox,
    UButton: Button,
  }))
    app.component(name, component);
  app.mount(host);
  await vue.nextTick();
}

function input(type: string) {
  const element = host.querySelector(`input[type="${type}"]`);
  if (!(element instanceof HTMLInputElement))
    throw new Error(`Missing ${type} input`);
  return element;
}

it.each([
  undefined,
  { email: "visitor@example.test", password: "demo-public-only" },
])(
  "initializes public prefill %j without submitting or enabling keep-login",
  async (prefill) => {
    await mount(prefill);
    expect(input("email").value).toBe(prefill?.email ?? "");
    expect(input("password").value).toBe(prefill?.password ?? "");
    expect(
      host.querySelector('[role="checkbox"]')?.getAttribute("aria-checked"),
    ).toBe("false");
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("keeps user edits through config changes and unrelated rerenders instead of watching prefill", async () => {
  const prefill = {
    email: "visitor@example.test",
    password: "demo-public-only",
  };
  await mount(prefill);
  input("email").value = "changed@example.test";
  input("email").dispatchEvent(new Event("input", { bubbles: true }));
  input("password").value = "changed-password";
  input("password").dispatchEvent(new Event("input", { bubbles: true }));
  prefill.email = "replacement@example.test";
  metaTitle.value = "Another title";
  await vue.nextTick();
  expect(input("email").value).toBe("changed@example.test");
  expect(input("password").value).toBe("changed-password");
  expect(fetch).not.toHaveBeenCalled();
});
