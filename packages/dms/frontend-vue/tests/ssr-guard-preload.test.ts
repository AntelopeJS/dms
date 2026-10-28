/** @vitest-environment jsdom */
/**
 * A server render of a protected page waits on two requests made by its
 * middlewares, one after the other: the onboarding status (`onboarding`),
 * then the permission set (`auth`). Both start with the app instead, through
 * the real renderer runtime, middlewares and composables, and each middleware
 * joins the request already in flight.
 */
import { createSSRApp, defineComponent, h, nextTick, type App } from "vue";
import { renderToString } from "vue/server-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DmsAppContext, DmsFrontendRuntime } from "#dms/frontend-module";

const engine = await import("#dms/frontend-module");
for (const name of [
  "useDmsState",
  "useDmsApp",
  "useDmsAsyncData",
  "useDmsFetch",
  "useDmsData",
  "useDmsRoute",
  "defineDmsMiddleware",
  "defineDmsPlugin",
  "useDmsError",
  "abortDmsNavigation",
  "navigateDms",
] as const) {
  vi.stubGlobal(name, engine[name]);
}
vi.stubGlobal("useDmsRuntimeConfig", () => ({ public: { dms: {} } }));
vi.stubGlobal("useHomepage", () => "/home");

const session = { loggedIn: { value: true } };
vi.stubGlobal("useDmsUserSession", () => ({
  ...session,
  user: { value: { isValidated: true } },
}));
let pagePublic = false;
vi.stubGlobal("useSiteLayout", () => ({
  siteLayout: { value: {} },
  findMatchingRoute: (path: string) =>
    path === "/orders" ? { metadata: { publicAccess: pagePublic } } : null,
}));

const { useApiData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);
vi.stubGlobal("useApiData", useApiData);
const { usePermissions } = await import(
  "../layers/dms-core/app/composables/auth/usePermissions"
);
vi.stubGlobal("usePermissions", usePermissions);
const { useOnboarding } = await import(
  "../layers/dms-onboarding/app/composables/onboarding/useOnboarding"
);
vi.stubGlobal("useOnboarding", useOnboarding);
const { default: onboardingMiddleware } = await import(
  "../layers/dms-onboarding/app/middleware/onboarding.global"
);
const { default: authMiddleware } = await import(
  "../layers/dms-auth/app/middleware/auth"
);
const { default: onboardingPreload } = await import(
  "../layers/dms-onboarding/app/plugins/onboarding-preload"
);
const { default: permissionsPreload } = await import(
  "../layers/dms-auth/app/plugins/permissions-preload"
);

const ONBOARDING = "/api/onboarding/informations";
const PERMISSIONS = "/dms/permissions";
const ANSWERS: Record<string, unknown> = {
  [ONBOARDING]: { has_onboarded: true },
  [PERMISSIONS]: ["orders.read"],
};

interface PendingRequest {
  url: string;
  resolve: (value: unknown) => void;
}

const pending: PendingRequest[] = [];
const asked: string[] = [];

const $authFetch = vi.fn(
  (url: string) =>
    new Promise((resolve) => {
      asked.push(url);
      pending.push({ url, resolve });
    }),
);
vi.stubGlobal("useAuthFetch", () => ({ $authFetch }));

const settle = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/** The requests waiting at once, each round, until none is left. */
async function answerRounds(): Promise<string[][]> {
  const rounds: string[][] = [];
  for (let round = 0; round < 6; round++) {
    await settle();
    const waiting = pending.splice(0);
    if (waiting.length === 0) continue;
    rounds.push(waiting.map((request) => request.url).sort());
    for (const request of waiting) request.resolve(ANSWERS[request.url]);
  }
  return rounds;
}

const Page = defineComponent({
  setup() {
    engine.defineDmsPageMeta({ auth: true });
    const { hasPermission } = usePermissions();
    return () =>
      h("p", hasPermission("orders.read") ? "can read" : "cannot read");
  },
});

/** A server runtime, its app set up the way the DMS module registers it. */
function serverRender(path: string): { app: App; html: Promise<string> } {
  const runtime = engine.createDmsFrontendRuntime(undefined, {}, true);
  const app = createSSRApp(Page);
  const context = {
    runWithContext: (callback: () => unknown) => app.runWithContext(callback),
  } as unknown as DmsAppContext;
  app.config.globalProperties.$dms = context;
  runtime.appContext = context;
  runtime.route.path = path;
  runtime.route.fullPath = path;
  runtime.route.matched = [{}];
  engine.provideDmsFrontendRuntime(app, runtime as DmsFrontendRuntime);

  for (const plugin of [onboardingPreload, permissionsPreload])
    app.runWithContext(() => plugin(context));
  return { app, html: renderToString(app) };
}

beforeEach(async () => {
  pending.length = 0;
  asked.length = 0;
  $authFetch.mockClear();
  session.loggedIn.value = true;
  pagePublic = false;
  await engine.setupFrontendModules([
    {
      options: { public: {} },
      module: {
        setup(sdk) {
          sdk.registerMiddleware("auth", authMiddleware);
          sdk.registerMiddleware("onboarding", onboardingMiddleware, {
            global: true,
          });
        },
      },
    },
  ]);
});

describe("the requests a server render's middlewares wait on", () => {
  it("start together, and each middleware joins its own", async () => {
    const { html } = serverRender("/orders");
    const rounds = await answerRounds();

    expect(rounds).toEqual([[PERMISSIONS, ONBOARDING].sort()]);
    expect(asked.sort()).toEqual([PERMISSIONS, ONBOARDING].sort());
    expect(await html).toContain("can read");
  });

  it("ask for no permission set the middleware would not load", async () => {
    pagePublic = true;
    const { html } = serverRender("/orders");
    await answerRounds();
    expect(asked).toEqual([ONBOARDING]);
    expect(await html).toContain("cannot read");

    pending.length = 0;
    asked.length = 0;
    pagePublic = false;
    session.loggedIn.value = false;
    const signedOut = serverRender("/orders");
    await answerRounds();
    expect(asked).toEqual([ONBOARDING]);
    await signedOut.html.catch(() => undefined);
  });
});
