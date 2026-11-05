/** @vitest-environment jsdom */
/**
 * The document title: the page's name followed by the platform's title, on
 * the first render and after a sign-in or a workspace switch, which drops
 * every async data the plugin read at setup.
 */
import { useHead, useSeoMeta } from "@unhead/vue";
import { createHead, renderDOMHead } from "@unhead/vue/client";
import * as vue from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dmsAppContext } from "./fixtures/dmsAppContext";

const PLATFORM_TITLE = "Solar Ops";
const ACCOUNT_A = { accountId: "account-a", activeTenantId: "tenant-1" };
const ACCOUNT_B = { accountId: "account-b", activeTenantId: "tenant-1" };

const engine = await import("#dms/frontend-module");
for (const [name, value] of Object.entries({ ...vue, ...engine }))
  vi.stubGlobal(name, value);
vi.stubGlobal("useHead", useHead);
vi.stubGlobal("useSeoMeta", useSeoMeta);

const systemStateReads = vi.fn(async (url: string) => {
  expect(url).toBe("/api/system-state");
  return {
    has_onboarded: true,
    meta: { title: PLATFORM_TITLE, description: "" },
  };
});
vi.stubGlobal("useAuthFetch", () => ({ $authFetch: systemStateReads }));

const { useApiData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);
vi.stubGlobal("useApiData", useApiData);
const { useSystemState } = await import(
  "../layers/dms-layout/app/composables/general/useSystemState"
);
vi.stubGlobal("useSystemState", useSystemState);
const { default: asyncDataScopePlugin } = await import(
  "../layers/dms-core/app/plugins/async-data-scope"
);
const { default: seoPlugin } = await import(
  "../layers/dms-layout/app/plugins/seo"
);

let app: vue.App | undefined;

async function settle(): Promise<void> {
  await vue.nextTick();
  await new Promise((done) => setTimeout(done, 0));
}

async function startOnPage(pageName: string) {
  const head = createHead();
  app = vue.createApp({ render: () => null });
  app.use(head);
  engine.provideDmsFrontendRuntime(
    app,
    engine.createDmsFrontendRuntime(undefined, {}),
  );
  const session = app.runWithContext(() =>
    engine.useDmsState<unknown>("dms-session", () => null),
  );
  session.value = ACCOUNT_A;
  const context = dmsAppContext(app);
  await app.runWithContext(() => {
    const setups = [asyncDataScopePlugin(context), seoPlugin(context)];
    useHead({ title: pageName });
    return Promise.all(setups);
  });
  const title = async () => {
    await settle();
    await renderDOMHead(head, { document });
    return document.title;
  };
  return { session, title };
}

beforeEach(async () => {
  systemStateReads.mockClear();
  document.title = "";
  await engine.setupFrontendModules([]);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("the document title", () => {
  it("follows the page name with the platform title", async () => {
    const { title } = await startOnPage("Dashboard");

    expect(await title()).toBe(`Dashboard | ${PLATFORM_TITLE}`);
  });

  it("keeps the platform title once the session switches account", async () => {
    const { session, title } = await startOnPage("Dashboard");
    expect(await title()).toBe(`Dashboard | ${PLATFORM_TITLE}`);

    session.value = ACCOUNT_B;

    expect(await title()).toBe(`Dashboard | ${PLATFORM_TITLE}`);
  });
});
