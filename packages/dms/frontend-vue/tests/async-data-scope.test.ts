// @vitest-environment jsdom
/**
 * Every key of the async data lives in the scope of the session's account and
 * workspace: the browser finds what the server transferred under the same
 * scope, and a switch of account or workspace drops the previous session's
 * data instead of showing it under the new one.
 */
import {
  type App,
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  type Ref,
  Suspense,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DmsFrontendRuntime } from "#dms/frontend-module";
import { asyncDataScopeOf } from "../layers/dms-core/app/build/utils/asyncDataScope";

const engine = await import("#dms/frontend-module");
const { default: asyncDataScopePlugin } = await import(
  "../layers/dms-core/app/plugins/async-data-scope"
);

const ACCOUNT_A = { accountId: "account-a", activeTenantId: "tenant-1" };
const ACCOUNT_B = { accountId: "account-b", activeTenantId: "tenant-1" };

const handler = vi.fn(async () => "orders of account A");

const Page = defineComponent({
  async setup() {
    const { data } = await engine.useDmsAsyncData("orders", handler);
    return () => h("p", data.value ?? "none");
  },
});

const Root = defineComponent({
  setup: () => () => h(Suspense, null, { default: () => h(Page) }),
});

const mounted: App[] = [];

function start(app: App, runtime: DmsFrontendRuntime, session: object) {
  engine.provideDmsFrontendRuntime(app, runtime);
  app.runWithContext(() => {
    engine.useDmsState("dms-session", () => null).value = session;
    void asyncDataScopePlugin({} as never);
  });
}

async function settle(): Promise<void> {
  await nextTick();
  await new Promise((done) => setTimeout(done, 0));
}

beforeEach(async () => {
  handler.mockClear();
  await engine.setupFrontendModules([]);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

describe("the async data scope", () => {
  it("is a digest of the account and the workspace, none when signed out", () => {
    const scope = asyncDataScopeOf(ACCOUNT_A);
    expect(scope).toMatch(/^[0-9a-z]+$/);
    expect(scope).not.toContain("account-a");
    expect(asyncDataScopeOf({ ...ACCOUNT_A })).toBe(scope);
    expect(asyncDataScopeOf(ACCOUNT_B)).not.toBe(scope);
    expect(
      asyncDataScopeOf({ ...ACCOUNT_A, activeTenantId: "tenant-2" }),
    ).not.toBe(scope);
    expect(asyncDataScopeOf(null)).toBeUndefined();
    expect(asyncDataScopeOf({})).toBeUndefined();
  });

  it("hands the server's data to the browser under the same session", async () => {
    const server = engine.createDmsFrontendRuntime(undefined, {}, true);
    const serverApp = createSSRApp(Root);
    start(serverApp, server, ACCOUNT_A);
    expect(await renderToString(serverApp)).toBe("<p>orders of account A</p>");
    const payload = structuredClone(engine.serializeDmsPayload(server));
    expect(JSON.stringify(payload)).not.toContain("account-a");

    handler.mockClear();
    const browser = engine.createDmsFrontendRuntime(undefined, {});
    const browserApp = createApp(Root);
    start(browserApp, browser, ACCOUNT_A);
    engine.restoreDmsPayload(browser, payload);
    const host = document.createElement("div");
    browserApp.mount(host);
    mounted.push(browserApp);
    await settle();

    expect(handler).not.toHaveBeenCalled();
    expect(host.textContent).toBe("orders of account A");
  });

  it("drops the previous account's data once the session switches", async () => {
    const browser = engine.createDmsFrontendRuntime(undefined, {});
    const browserApp = createApp(Root);
    start(browserApp, browser, ACCOUNT_A);
    const host = document.createElement("div");
    browserApp.mount(host);
    mounted.push(browserApp);
    await settle();
    expect(host.textContent).toBe("orders of account A");

    browserApp.runWithContext(() => {
      engine.useDmsState("dms-session", () => null).value = ACCOUNT_B;
    });
    await settle();

    expect(browser.asyncData.size).toBe(0);
    expect(host.textContent).toBe("none");
  });

  it("is set before a higher-priority module's plugin reads at setup", async () => {
    const read = vi.fn(async () => "sidecar running");
    let status: Ref<unknown> | undefined;
    await engine.setupFrontendModules([
      {
        // dms-ai's assistant: of higher priority, it reads as it starts.
        options: { public: {} },
        module: {
          setup(sdk) {
            sdk.registerPlugin(() => {
              status = engine.useDmsAsyncData("sidecar-info", read).data;
            });
          },
        },
      },
      {
        options: { public: {} },
        module: {
          setup(sdk) {
            sdk.registerPlugin(asyncDataScopePlugin, { enforce: "pre" });
          },
        },
      },
    ]);
    const browser = engine.createDmsFrontendRuntime(undefined, {});
    const app = createApp(Root);
    engine.provideDmsFrontendRuntime(app, browser);
    app.runWithContext(() => {
      engine.useDmsState("dms-session", () => null).value = ACCOUNT_A;
    });
    await engine.installDmsPlugins(
      app,
      { locale: { value: "en" }, setLocaleMessage() {} } as never,
      browser,
      async () => ({}),
      ["en"],
    );
    await settle();

    expect(read).toHaveBeenCalledOnce();
    expect(status?.value).toBe("sidecar running");
    expect([...browser.asyncData.keys()]).toEqual([
      `${asyncDataScopeOf(ACCOUNT_A)}|sidecar-info`,
    ]);
  });
});
