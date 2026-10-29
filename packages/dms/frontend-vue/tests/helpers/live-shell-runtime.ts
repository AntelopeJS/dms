import * as vue from "vue";
import { afterAll, expect, vi } from "vitest";
import { browserRuntime, engine } from "./api-data-runtime";
import { stubBlockRuntime } from "./block-runtime";
import {
  createRealtimeServer,
  installRealtimeFetch,
} from "../fixtures/realtimeServer";
import { createFakeBrowser } from "../fixtures/fakeBrowser";
import {
  useUserRealtime,
  type RealtimeEvent,
} from "../../layers/dms-core/app/composables/realtime/useUserRealtime";
import { createI18n } from "vue-i18n";
import { App as InertiaApp } from "@inertiajs/vue3";
import { useToast } from "@nuxt/ui/composables/useToast";

const shellModules = import.meta.glob([
  "../../layers/dms-layout/app/composables/**/*.ts",
  "../../layers/dms-layout/app/utils/*.ts",
  "../../layers/dms-core/app/types/page.ts",
  "../../layers/dms-core/app/composables/page/useSiteLayout.ts",
  "../../layers/dms-core/app/utils/pageQuery.ts",
  "../../layers/dms-ui/app/composables/layout/useInstantSaveHeader.ts",
  "../../layers/dms-ui/app/composables/layout/usePageHeaderActions.ts",
  "../../layers/dms-ui/app/composables/useAppSidePanels.ts",
  "../../layers/dms-ui/app/composables/useSidePanel.ts",
  "../../layers/dms-ui/app/composables/form/types/events.ts",
  "../../layers/dms-core/app/composables/auth/useCurrentUser.ts",
  "../../layers/dms-core/app/composables/auth/usePermissions.ts",
  "../../layers/dms-core/app/composables/auth/useMultiAccount.ts",
  "../../layers/dms-core/app/composables/auth/useLogout.ts",
  "../../layers/dms-core/app/composables/realtime/usePageRealtime.ts",
  "../../layers/dms-core/app/composables/translation/useUniqueLocales.ts",
  "../../layers/dms-core/app/composables/useHomepage.ts",
  "../../layers/dms-core/app/utils/menu.ts",
  "../../layers/dms-core/app/utils/query-validation.ts",
  "../../layers/dms-core/app/utils/http-status.ts",
  "../../layers/dms-core/app/composables/functions/useDefinedFunction.ts",
  "../../layers/dms-ui/app/composables/useFileReadUrls.ts",
]);

export async function installShellRuntime(path = "/") {
  const inertiaApp = vue.createApp(InertiaApp, {
    initialPage: {
      component: "Fixture",
      url: path,
      version: "1",
      props: {},
      clearHistory: false,
      encryptHistory: false,
    },
    initialComponent: { render: () => null },
    resolveComponent: async () => ({ render: () => null }),
  });
  inertiaApp.mount(document.createElement("div"));
  const app = vue.createApp({ render: () => null });
  const runtime = browserRuntime(app);
  engine.useDmsRuntimeConfig().public.dms = {
    baseURL: "http://api",
    homepage: "/",
  };
  const i18n = createI18n({
    legacy: false,
    locale: "en",
    messages: { en: {} },
  });
  await engine.installDmsPlugins(app, i18n.global, runtime, async () => ({}), [
    "en",
  ]);
  app.mount(document.createElement("div"));
  await stubBlockRuntime(async () => ({}));
  for (const [name, value] of Object.entries(vue)) vi.stubGlobal(name, value);
  for (const [name, value] of Object.entries(engine))
    vi.stubGlobal(name, value);
  for (const load of Object.values(shellModules)) {
    const module = await load();
    for (const [name, value] of Object.entries(module))
      vi.stubGlobal(name, value);
  }
  vi.stubGlobal("useI18n", () => ({ ...i18n.global, locales: vue.ref([]) }));
  vi.stubGlobal("useToast", useToast);
  engine.updateDmsAppConfig([
    { module: "shell-fixture", config: { ui: { icons: {} } } },
  ]);
  engine.useDmsState("dms-siteLayout", () => ({ pages: {}, categories: {} }));
  engine.useDmsState("dms-pageTree", () => ({
    childrenOrders: [],
    children: {},
  }));
  engine.useDmsState("notifications-counts-loaded", () => true);
  return () => {
    inertiaApp.unmount();
    app.unmount();
    runtime.scope.stop();
  };
}

export function registerShellUi(app: vue.App) {
  app.config.globalProperties.$t = (key: string) => key;
  app.component(
    "UDashboardSidebar",
    (_: Parameters<vue.FunctionalComponent>[0], { slots }) =>
      vue.h("nav", [
        slots.header?.({ collapsed: false }),
        slots.default?.({ collapsed: false }),
        slots.footer?.({ collapsed: false }),
      ]),
  );
  app.component(
    "UDashboardNavbar",
    (_: Parameters<vue.FunctionalComponent>[0], { slots }) =>
      vue.h("header", [slots.leading?.(), slots.right?.(), slots.default?.()]),
  );
}

export function liveShellRuntime() {
  const server = createRealtimeServer();
  const scope = vue.effectScope();
  let initialized = false;
  let disposeRuntime: (() => void) | undefined;
  afterAll(() => {
    scope.stop();
    disposeRuntime?.();
    vi.unstubAllGlobals();
  });
  const settle = async () => {
    for (let i = 0; i < 60; i++) await Promise.resolve();
  };
  return {
    async start() {
      if (!initialized) {
        disposeRuntime = await installShellRuntime();
        createFakeBrowser().openTab().activate();
        vi.stubGlobal("fetch", globalThis.fetch);
        installRealtimeFetch(server);
        scope.run(() => useUserRealtime());
        initialized = true;
      }
      engine.useDmsState<{ _id: string } | null>("dms-user", () => null).value =
        { _id: "live-reader" };
      await settle();
      expect(useUserRealtime().sessionId.value).toBeTruthy();
    },
    async stop() {
      engine.useDmsState("dms-user", () => null).value = null;
      await settle();
      expect(server.openConnections()).toHaveLength(0);
    },
    async publish(topic: string, payload?: RealtimeEvent["payload"]) {
      const sessionId = useUserRealtime().sessionId.value;
      if (!sessionId) throw new Error("Realtime session is not open");
      server.send(sessionId, "event", {
        topic,
        type: "request",
        ts: Date.now(),
        payload,
      });
      await settle();
    },
  };
}
