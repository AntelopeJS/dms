/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  type App,
  type Component,
} from "vue";
import { engine } from "./helpers/api-data-runtime";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";
import { usePostLoginRedirect } from "../layers/dms-auth/app/composables/usePostLoginRedirect";

const { default: LoginPage } = await import(
  "../layers/dms-auth/app/custom-pages/auth/login.vue"
);
const { default: OAuthCompletePage } = await import(
  "../layers/dms-auth/app/custom-pages/auth/oauth-complete.vue"
);

const TOKEN = "assignment-token";
const CORE_PAGE = { path: "/auth/no-membership" };
const MODULE_PAGE_KEY = "auth/no-workspace";

const navigate = vi.fn();
const fetchApi = vi.fn();
let route: { path: string; query: Record<string, string> };
let app: App;
let host: HTMLDivElement;

const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("span", slots.default?.()),
});

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
            emit("submit", {
              data: { ...props.state, email: "a@b.test", password: "pw" },
            });
          },
        },
        slots.default?.(),
      );
  },
});

async function withModulePage(registered: boolean) {
  await engine.setupFrontendModules(
    registered
      ? [
          {
            module: {
              setup: (sdk) => sdk.registerPage(MODULE_PAGE_KEY, Passthrough),
            },
            options: {},
          },
        ]
      : [],
  );
}

function mountPage(page: Component) {
  app = createApp(page);
  app.config.globalProperties.$t = (key: string) => key;
  for (const name of [
    "UButton",
    "UFormField",
    "UInput",
    "UCheckbox",
    "UIcon",
    "DmsLink",
    "DmsOAuthButtons",
  ])
    app.component(name, Passthrough);
  app.component("UForm", Form);
  app.mount(host);
}

async function settle() {
  for (let tick = 0; tick < 10; tick++) {
    await Promise.resolve();
    await nextTick();
  }
}

async function signInWithoutWorkspace() {
  route = { path: "/auth", query: {} };
  fetchApi.mockResolvedValueOnce({
    requires_tenant_assignment: true,
    tenant_assignment_token: TOKEN,
    user: { _id: "user" },
  });
  mountPage(LoginPage);
  await settle();
  host.querySelector("form")!.dispatchEvent(new Event("submit"));
  await settle();
}

async function completeOAuthWithoutWorkspace() {
  route = { path: "/auth/oauth/complete", query: {} };
  fetchApi.mockResolvedValueOnce({
    kind: "no-workspace",
    token: TOKEN,
    provider: "google",
  });
  mountPage(OAuthCompletePage);
  await settle();
}

beforeEach(() => {
  navigate.mockReset();
  fetchApi.mockReset();
  installAuthSettingsRuntime();
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useHomepage", () => "/home");
  vi.stubGlobal("useDmsRuntimeConfig", () => ({ public: { dms: {} } }));
  vi.stubGlobal("useSystemState", () => ({ metaTitle: { value: "" } }));
  vi.stubGlobal("useAuthLinks", () => ({ links: { value: [] } }));
  vi.stubGlobal("useOAuthErrorToast", () => {});
  vi.stubGlobal("isFromAccountsList", () => false);
  vi.stubGlobal("withAccountsFlag", (_query: unknown, extra = {}) => extra);
  vi.stubGlobal("usePostLoginRedirect", usePostLoginRedirect);
  vi.stubGlobal("navigateDms", navigate);
  vi.stubGlobal("$fetch", fetchApi);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(async () => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
  await withModulePage(false);
});

it("sends a password sign-in that belongs to no workspace to the DMS's own page when no module serves /auth/no-workspace", async () => {
  await withModulePage(false);
  await signInWithoutWorkspace();

  expect(fetchApi).toHaveBeenCalledWith(
    "/auth/login",
    expect.objectContaining({ method: "POST" }),
  );
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith(CORE_PAGE);
});

it("hands a password sign-in that belongs to no workspace and its token to the module page at /auth/no-workspace", async () => {
  await withModulePage(true);
  await signInWithoutWorkspace();

  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith({
    path: "/auth/no-workspace",
    query: { token: TOKEN },
  });
});

it("replaces the OAuth completion with the DMS's own page when no module serves /auth/no-workspace", async () => {
  await withModulePage(false);
  await completeOAuthWithoutWorkspace();

  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith(CORE_PAGE, { replace: true });
});

it("hands an OAuth sign-in that belongs to no workspace, its token and provider to the module page at /auth/no-workspace", async () => {
  await withModulePage(true);
  await completeOAuthWithoutWorkspace();

  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith(
    {
      path: "/auth/no-workspace",
      query: { token: TOKEN, provider: "google" },
    },
    { replace: true },
  );
});
