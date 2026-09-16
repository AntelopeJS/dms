import { defineAsyncComponent, type Component } from "vue";
import {
  type DmsFrontendModule,
  useDmsAppConfig,
} from "#dms-inertia/frontend-module";
import { defu } from "defu";
import appConfig from "./layers/dms-layout/app/app.config";
import authMiddleware from "./layers/dms-auth/app/middleware/auth";
import homepageRedirectMiddleware from "./layers/dms-layout/app/middleware/homepage-redirect.global";
import moduleRoutingMiddleware from "./layers/dms-layout/app/middleware/module-routing.global";
import pageLeaveGuardMiddleware from "./layers/dms-layout/app/middleware/page-leave-guard.global";
import interfaceScalePlugin from "./layers/dms-layout/app/plugins/interface-scale";
import languageSyncPlugin from "./layers/dms-layout/app/plugins/language-sync";
import seoPlugin from "./layers/dms-layout/app/plugins/seo";
import onboardingMiddleware from "./layers/dms-onboarding/app/middleware/onboarding.global";
import registerPlugin from "./layers/dms-ui/app/plugins/register";
import shortcutsPlugin from "./layers/dms-ui/app/plugins/shortcuts";
import tableViewDisplaysPlugin from "./layers/dms-ui/app/plugins/table-view-displays.client";
import "./layers/dms-layout/app/assets/css/main.css";
import type {} from "./layers/dms-core/shared/types/runtime-config";
import type {} from "./layers/dms-core/shared/types/app-config";

interface VueModule {
  default: Component;
}

type VueLoader = () => Promise<VueModule>;

interface DmsPublicOptions {
  dms?: {
    baseURL?: string;
  };
}

const components = import.meta.glob<VueModule>(
  "./layers/**/app/{components,build/components}/**/*.vue",
);
const customPages = import.meta.glob<VueModule>(
  "./layers/**/app/custom-pages/**/*.vue",
);
const dynamicPages = import.meta.glob<VueModule>(
  "./layers/**/app/pages/**/*.vue",
);
const layouts = import.meta.glob<VueModule>(
  "./layers/**/app/custom-layouts/**/*.vue",
);
const errorPages = import.meta.glob<VueModule>("./layers/**/app/error.vue");

function pascalCase(path: string): string {
  return path
    .replace(/\.vue$/, "")
    .split(/[./_-]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
}

function componentName(path: string): string {
  const relativePath = path.replace(
    /^.*\/(?:components|build\/components)\//,
    "",
  );
  return `Dms${pascalCase(relativePath.split("/").at(-1) ?? relativePath)}`;
}

function entryName(path: string, directory: string): string {
  return path
    .replace(new RegExp(`^.*\\/${directory}\\/`), "")
    .replace(/\.vue$/, "");
}

function sortedEntries(
  loaders: Record<string, VueLoader>,
): Array<[string, VueLoader]> {
  return Object.entries(loaders).sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function lazyComponent(loader: VueLoader): Component {
  return defineAsyncComponent(async () => (await loader()).default);
}

function registerComponents(
  sdk: Parameters<DmsFrontendModule["setup"]>[0],
): void {
  const names = new Map<string, string>();
  for (const [path, loader] of sortedEntries(components)) {
    const name = componentName(path);
    const previousPath = names.get(name);
    if (previousPath) {
      throw new Error(
        `Duplicate component name ${name}: ${previousPath}, ${path}`,
      );
    }
    names.set(name, path);
    sdk.registerComponent(name, lazyComponent(loader));
  }
}

function registerEntries(
  entries: Record<string, VueLoader>,
  directory: string,
  register: (name: string, component: Component, preload?: VueLoader) => void,
): void {
  sortedEntries(entries).forEach(([path, loader]) => {
    register(entryName(path, directory), lazyComponent(loader), loader);
  });
}

function registerCustomPages(
  sdk: Parameters<DmsFrontendModule["setup"]>[0],
): void {
  sortedEntries(customPages).forEach(([path, loader]) => {
    const name = entryName(path, "custom-pages").replace(/\/index$/, "");
    const component = lazyComponent(loader);
    sdk.registerPage(name, component, loader);
    sdk.registerComponent(`Dms${pascalCase(name)}`, component);
  });
}

function registerDeferredPlugins(
  sdk: Parameters<DmsFrontendModule["setup"]>[0],
): void {
  sdk.registerPlugin(
    (context) => {
      context.hook("app:mounted", async () => {
        const { installDeferredPlugins } = await import("./deferred-plugins");
        await installDeferredPlugins(context);
      });
    },
    { clientOnly: true },
  );
}

function registerPlugins(sdk: Parameters<DmsFrontendModule["setup"]>[0]): void {
  const clientOnly = { clientOnly: true };
  if (import.meta.env.DEV) {
    sdk.registerPlugin(async (context) => {
      const plugin = await import(
        "./layers/dms-layout/app/plugins/dms-dev-reload.client"
      );
      await plugin.default(context);
    }, clientOnly);
  }
  sdk.registerPlugin(interfaceScalePlugin);
  sdk.registerPlugin(languageSyncPlugin);
  sdk.registerPlugin(seoPlugin);
  sdk.registerPlugin(registerPlugin);
  sdk.registerPlugin(shortcutsPlugin);
  sdk.registerPlugin(tableViewDisplaysPlugin, clientOnly);
  registerDeferredPlugins(sdk);
}

function registerMiddleware(
  sdk: Parameters<DmsFrontendModule["setup"]>[0],
): void {
  const global = { global: true };
  sdk.registerMiddleware("auth", authMiddleware);
  sdk.registerMiddleware(
    "homepage-redirect",
    homepageRedirectMiddleware,
    global,
  );
  sdk.registerMiddleware("module-routing", moduleRoutingMiddleware, global);
  sdk.registerMiddleware("page-leave-guard", pageLeaveGuardMiddleware, global);
  sdk.registerMiddleware("onboarding", onboardingMiddleware, global);
}

const frontendModule: DmsFrontendModule = {
  setup(sdk) {
    const publicOptions = sdk.options.public as DmsPublicOptions;
    if (publicOptions.dms && typeof window !== "undefined")
      publicOptions.dms.baseURL = window.location.origin;
    const runtimeAppConfig = useDmsAppConfig();
    Object.assign(runtimeAppConfig, defu(runtimeAppConfig, appConfig));
    registerPlugins(sdk);
    registerMiddleware(sdk);
    registerComponents(sdk);
    registerCustomPages(sdk);
    registerEntries(dynamicPages, "pages", sdk.registerDynamicPage);
    registerEntries(layouts, "custom-layouts", sdk.registerLayout);
    sortedEntries(errorPages).forEach(([, loader]) => {
      sdk.registerErrorPage(lazyComponent(loader), loader);
    });
    sdk.provide("dmsPublicConfig", sdk.options.public);
  },
};

export default frontendModule;
