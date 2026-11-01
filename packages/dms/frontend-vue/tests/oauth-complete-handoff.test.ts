/** @vitest-environment jsdom */
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  reactive,
  ref,
  Suspense,
  watch,
  type App,
  type Ref,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePostLoginRedirect } from "../layers/dms-auth/app/composables/usePostLoginRedirect";
import { usePageLayout } from "../layers/dms-layout/app/composables/page/usePageLayout";
import { useSiteLayout } from "../layers/dms-core/app/composables/page/useSiteLayout";
import type { PageLayout } from "../layers/dms-core/app/types/page";
import {
  installReadOnlyRefusal,
  readOnlyFailure,
} from "./helpers/read-only-refusal";

const { default: OAuthCompletePage } = await import(
  "../layers/dms-auth/app/custom-pages/auth/oauth-complete.vue"
);

const PATH = "/auth/oauth/complete";
const LAYOUT_URL = `${PATH}/pagelayout`;
const SITE_LAYOUT_URL = "/dms/sitelayout";
const HANDOFF_URL = "/auth/oauth/handoff";
const HOMEPAGE = "/home";

const state = new Map<string, Ref>();
const authFetch = vi.fn();
const fetchHandoff = vi.fn();
const navigate = vi.fn();
let mounts = 0;
let route: { path: string; query: Record<string, string> };
let app: App;
let host: HTMLDivElement;

const completionLayout: PageLayout = {
  components: { complete: { options: {} } },
  layout: {},
};

const siteResponse = {
  siteLayout: {
    pages: {
      [PATH]: {
        id: "auth-oauth-complete",
        fullId: "auth-oauth-complete",
        fullSlug: PATH,
        displayName: "Completing",
        layoutUrl: LAYOUT_URL,
        publicAccess: true,
      },
    },
    categories: {},
  },
  siteLayoutTree: undefined,
  quickActions: undefined,
  modules: {},
  isOwner: false,
};

const Page = defineComponent({
  async setup() {
    const { pageLayout } = await usePageLayout();
    return () =>
      h(
        "main",
        Object.keys(pageLayout.value?.components ?? {}).map((key) =>
          h(OAuthCompletePage, { key }),
        ),
      );
  },
});

function installRuntime() {
  const runtime = {
    runWithContext: <T>(fn: () => T) => fn(),
    $i18n: { setLocale: vi.fn() },
  };
  Object.entries({ computed, ref, watch }).forEach(([key, value]) =>
    vi.stubGlobal(key, value),
  );
  vi.stubGlobal("onMounted", (hook: Parameters<typeof onMounted>[0]) =>
    onMounted(() => {
      mounts += 1;
      return hook();
    }),
  );
  vi.stubGlobal("useDmsApp", () => runtime);
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useDmsState", <T>(key: string, initial: () => T) => {
    if (!state.has(key)) state.set(key, ref(initial()));
    return state.get(key);
  });
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useSiteLayout", useSiteLayout);
  vi.stubGlobal("useHomepage", () => HOMEPAGE);
  vi.stubGlobal("useDmsUserSession", () => ({
    fetch: async () => undefined,
    user: ref({ _id: "user" }),
  }));
  vi.stubGlobal("useMultiAccount", () => ({ addCurrentAccount: vi.fn() }));
  vi.stubGlobal("usePostLoginRedirect", usePostLoginRedirect);
  vi.stubGlobal("navigateDms", navigate);
  vi.stubGlobal(
    "$fetch",
    (url: string, options: Parameters<typeof $fetch>[1]) =>
      url === HANDOFF_URL ? fetchHandoff(options) : Promise.reject(url),
  );
}

function mountCompletionPage() {
  route.path = PATH;
  const layout = useSiteLayout();
  layout.siteLayout.value = siteResponse.siteLayout;
  layout.pageLayouts.value = { [LAYOUT_URL]: completionLayout };
  app = createApp({
    render: () => h(Suspense, null, { default: () => h(Page) }),
  });
  app.config.globalProperties.$t = (key: string) => key;
  app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
  app.mount(host);
}

const siteLayoutFetches = () =>
  authFetch.mock.calls.filter(([url]) => url === SITE_LAYOUT_URL).length;

async function settle() {
  for (let tick = 0; tick < 20; tick++) {
    await Promise.resolve();
    await nextTick();
  }
}

async function respond(url: string) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  return url === SITE_LAYOUT_URL ? siteResponse : completionLayout;
}

beforeEach(() => {
  state.clear();
  mounts = 0;

  authFetch.mockImplementation(respond);
  fetchHandoff.mockResolvedValue({ kind: "none" });
  route = reactive({ path: PATH, query: {} });

  navigate.mockImplementation(async (to: string | { path: string }) => {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The navigation stub accepts the router's string and object destination variants.
    route.path = typeof to === "string" ? to : to.path;
  });
  installRuntime();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("consumes the handoff once when the identity refresh remounts the page", async () => {
  const identityRefresh = Promise.withResolvers<void>();
  authFetch.mockImplementation(async (url: string) => {
    if (url === SITE_LAYOUT_URL) await identityRefresh.promise;
    return respond(url);
  });
  mountCompletionPage();
  await vi.waitFor(() => expect(mounts).toBeGreaterThanOrEqual(2));
  identityRefresh.resolve();
  await vi.waitFor(() =>
    expect(navigate).toHaveBeenCalledWith(HOMEPAGE, { replace: true }),
  );
  await settle();

  expect(fetchHandoff).toHaveBeenCalledOnce();
  expect(siteLayoutFetches()).toBe(1);
  expect(navigate).toHaveBeenCalledOnce();

  expect(mounts).toBe(2);
});

it("redirects to the sign-in page once when the handoff fails", async () => {
  fetchHandoff.mockRejectedValue(new Error("offline"));
  mountCompletionPage();
  await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
  await settle();

  expect(fetchHandoff).toHaveBeenCalledOnce();
  expect(navigate).toHaveBeenCalledExactlyOnceWith(
    { path: "/auth", query: { oauth_error: "error.oauth.failed" } },
    { replace: true },
  );
});

it("completes again on a later visit, once the previous one settled", async () => {
  mountCompletionPage();
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  await settle();
  app.unmount();

  mountCompletionPage();
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
  await settle();

  expect(fetchHandoff).toHaveBeenCalledTimes(2);
});

it("shows only the read-only notice instead of redirecting to another error toast", async () => {
  const add = vi.fn();
  vi.stubGlobal("useToast", () => ({ add }));
  installReadOnlyRefusal();
  fetchHandoff.mockRejectedValue(readOnlyFailure());
  app = createApp(OAuthCompletePage);
  app.config.globalProperties.$t = (key: string) => key;
  app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
  app.mount(host);
  await settle();
  expect(add).toHaveBeenCalledOnce();
  expect(navigate).not.toHaveBeenCalled();
});
