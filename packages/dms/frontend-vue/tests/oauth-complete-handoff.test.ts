// @vitest-environment jsdom
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
import { useSiteLayout } from "../layers/dms-layout/app/composables/page/useSiteLayout";
import type { PageLayout } from "../layers/dms-layout/app/types/page";

// The OAuth completion page, drawn by the real page layout cache: the
// post-login redirect refreshes the site layout for the new identity, which
// empties that cache and remounts the page while its layout comes back.

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
} as unknown as PageLayout;

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
    runWithContext: (fn: () => unknown) => fn(),
    $i18n: { setLocale: vi.fn() },
  };
  Object.entries({ computed, ref, watch }).forEach(([key, value]) =>
    vi.stubGlobal(key, value),
  );
  vi.stubGlobal("onMounted", (hook: () => unknown) =>
    onMounted(() => {
      mounts += 1;
      return hook();
    }),
  );
  vi.stubGlobal("useDmsApp", () => runtime);
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useDmsState", (key: string, initial: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(initial()));
    return state.get(key);
  });
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useSiteLayout", useSiteLayout);
  vi.stubGlobal("useHomepage", () => HOMEPAGE);
  vi.stubGlobal("useUserSession", () => ({
    fetch: async () => undefined,
    user: ref({ _id: "user" }),
  }));
  vi.stubGlobal("useMultiAccount", () => ({ addCurrentAccount: vi.fn() }));
  vi.stubGlobal("usePostLoginRedirect", usePostLoginRedirect);
  vi.stubGlobal("navigateDms", navigate);
  vi.stubGlobal("$fetch", (url: string, options: unknown) =>
    url === HANDOFF_URL ? fetchHandoff(options) : Promise.reject(url),
  );
}

function mountCompletionPage() {
  route.path = PATH;
  const layout = useSiteLayout();
  layout.siteLayout.value = siteResponse.siteLayout as never;
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

beforeEach(() => {
  state.clear();
  mounts = 0;
  // Answered on later tasks, like the network, the page layout first as on
  // the playground: the page is drawn again before the redirect leaves it.
  authFetch.mockImplementation(async (url: string) => {
    const site = url === SITE_LAYOUT_URL;
    await new Promise((resolve) => setTimeout(resolve, site ? 5 : 0));
    return site ? siteResponse : completionLayout;
  });
  fetchHandoff.mockResolvedValue({ kind: "none" });
  route = reactive({ path: PATH, query: {} });
  // Leaving the page unmounts it, as the router does: the completion page
  // has no layout on any other route.
  navigate.mockImplementation(async (to: string | { path: string }) => {
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
  mountCompletionPage();
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(HOMEPAGE));
  await settle();

  expect(fetchHandoff).toHaveBeenCalledOnce();
  expect(siteLayoutFetches()).toBe(1);
  expect(navigate).toHaveBeenCalledOnce();
  // The refresh did empty the cache and remount the page: the new instance
  // joined the completion already running.
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
