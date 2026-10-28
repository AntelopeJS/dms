/** @vitest-environment jsdom */
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
  watchEffect,
  type App,
  type Component,
} from "vue";
import { usePostLoginRedirect } from "../layers/dms-auth/app/composables/usePostLoginRedirect";
import {
  installAuthSettingsRuntime,
  PinInput,
} from "./helpers/auth-settings-runtime";

const { default: OAuthCompletePage } = await import(
  "../layers/dms-auth/app/custom-pages/auth/oauth-complete.vue"
);
const { default: TwoFactorPage } = await import(
  "../layers/dms-auth/app/custom-pages/auth/2fa.vue"
);
const { default: BackupCodePage } = await import(
  "../layers/dms-auth/app/custom-pages/auth/backup.vue"
);

const HOMEPAGE = "/home";
const navigate = vi.fn();
const fetchApi = vi.fn();
let route: { path: string; query: Record<string, string> };
let app: App;
let host: HTMLDivElement;

const Form = defineComponent({
  props: { state: { type: Object, required: true } },
  emits: ["submit"],
  setup: (props, { emit, expose, slots }) => {
    expose({ setErrors: () => undefined, getErrors: () => [] });
    return () =>
      h(
        "form",
        {
          onSubmit: (event: Event) => {
            event.preventDefault();
            emit("submit", { data: props.state });
          },
        },
        slots.default?.(),
      );
  },
});
const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("span", slots.default?.()),
});

function installRuntime() {
  installAuthSettingsRuntime();
  Object.entries({
    computed,
    ref,
    reactive,
    watch,
    watchEffect,
    onMounted,
  }).forEach(([key, value]) => vi.stubGlobal(key, value));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useTranslation", () => ({
    processApiMessage: (message: string) => message,
  }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useHomepage", () => HOMEPAGE);
  vi.stubGlobal("useDmsApp", () => ({
    runWithContext: (fn: () => unknown) => fn(),
    $i18n: { setLocale: vi.fn() },
  }));
  vi.stubGlobal("useDmsUserSession", () => ({
    fetch: async () => undefined,
    user: ref({ _id: "user" }),
  }));
  vi.stubGlobal("useMultiAccount", () => ({ addCurrentAccount: vi.fn() }));
  vi.stubGlobal("useSiteLayout", () => ({ refresh: async () => undefined }));
  vi.stubGlobal("withAccountsFlag", (_query: unknown, extra = {}) => extra);
  vi.stubGlobal("usePostLoginRedirect", usePostLoginRedirect);
  vi.stubGlobal("navigateDms", navigate);
  vi.stubGlobal("$fetch", fetchApi);
}

function mountPage(page: Component) {
  app = createApp(page);
  app.config.globalProperties.$t = (key: string) => key;
  for (const name of ["UButton", "UFormField", "UInput", "UIcon", "DmsLink"])
    app.component(name, Passthrough);
  app.component("UForm", Form);
  app.component("UPinInput", PinInput);
  app.mount(host);
}

async function settle() {
  for (let tick = 0; tick < 10; tick++) {
    await Promise.resolve();
    await nextTick();
  }
}

async function submit(code: string) {
  const input = host.querySelector<HTMLInputElement>('[data-testid="code"]');
  if (input) {
    input.value = code;
    input.dispatchEvent(new Event("input"));
    await settle();
  }
  host.querySelector("form")!.dispatchEvent(new Event("submit"));
  await settle();
}

beforeEach(() => {
  navigate.mockReset();
  fetchApi.mockReset();
  installRuntime();
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("replaces the OAuth completion page with the destination", async () => {
  route = { path: "/auth/oauth/complete", query: { redirect: "/settings" } };
  fetchApi.mockResolvedValueOnce({ kind: "none" });
  mountPage(OAuthCompletePage);
  await settle();

  expect(fetchApi).toHaveBeenCalledWith("/auth/oauth/handoff", {
    method: "POST",
  });
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith("/settings", { replace: true });
});

it("replaces the second-factor page with the destination", async () => {
  route = {
    path: "/auth/2fa",
    query: { token: "spent-token", methods: "totp" },
  };
  fetchApi.mockResolvedValueOnce(undefined);
  mountPage(TwoFactorPage);
  await settle();
  await submit("123456");

  expect(fetchApi).toHaveBeenCalledWith("/auth/verify-2fa", {
    method: "POST",
    body: { token: "spent-token", code: "123456", method: "totp" },
  });
  expect(navigate).toHaveBeenCalledWith(HOMEPAGE, { replace: true });
});

it("replaces the backup code page with the destination", async () => {
  route = { path: "/auth/backup", query: { token: "spent-token" } };
  fetchApi.mockResolvedValueOnce(undefined);
  mountPage(BackupCodePage);
  await settle();
  (host.querySelector("form") as HTMLFormElement).dispatchEvent(
    new Event("submit"),
  );
  await settle();

  expect(fetchApi).toHaveBeenCalledWith(
    "/auth/verify-2fa",
    expect.objectContaining({ method: "POST" }),
  );
  expect(navigate).toHaveBeenCalledWith(HOMEPAGE, { replace: true });
});
