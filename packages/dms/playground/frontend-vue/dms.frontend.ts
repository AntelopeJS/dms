import { type Component, defineAsyncComponent } from "vue";
import type { DmsFrontendModule } from "#dms-inertia/frontend-module";
import appWidgetDemoPlugin from "./app/plugins/app-widget-demo";
import dmsPageSetupDemoPlugin from "./app/plugins/dms-page-setup-demo.client";
import sidebarWidgetDemoPlugin from "./app/plugins/sidebar-widget-demo";
import tableViewCardsDisplayPlugin from "./app/plugins/table-view-cards-display.client";

interface VueModule {
  default: Component;
}

const components = import.meta.glob<VueModule>("./app/components/**/*.vue");

function componentName(path: string): string {
  const file = path.split("/").at(-1) ?? path;
  return file.replace(/\.vue$/, "");
}

const playgroundFrontend: DmsFrontendModule = {
  setup(sdk) {
    sdk.registerPlugin(appWidgetDemoPlugin);
    sdk.registerPlugin(dmsPageSetupDemoPlugin, { clientOnly: true });
    sdk.registerPlugin(sidebarWidgetDemoPlugin);
    sdk.registerPlugin(tableViewCardsDisplayPlugin, { clientOnly: true });
    const names = new Set<string>();
    Object.entries(components)
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([path, loader]) => {
        const name = componentName(path);
        if (names.has(name))
          throw new Error(`Duplicate component name: ${name}`);
        names.add(name);
        sdk.registerComponent(
          name,
          defineAsyncComponent(async () => (await loader()).default),
        );
      });
  },
};

export default playgroundFrontend;
