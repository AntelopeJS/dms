import { type Component, defineAsyncComponent } from "vue";
import type { DmsFrontendModule } from "#dms/frontend-module";
import appWidgetDemoPlugin from "./app/plugins/app-widget-demo";
import commandPaletteAssistantDemoPlugin from "./app/plugins/command-palette-assistant-demo.client";
import commandPaletteSourceDemoPlugin from "./app/plugins/command-palette-source-demo.client";
import dmsPageSetupDemoPlugin from "./app/plugins/dms-page-setup-demo.client";
import featurePaletteSourcePlugin from "./app/plugins/feature-palette-source.client";
import flagDisplayPlugin from "./app/plugins/flag-display";
import headerActionDemoPlugin from "./app/plugins/header-action-demo.client";
import pageValidationDemoPlugin from "./app/plugins/page-validation-demo";
import quickActionPingPlugin from "./app/plugins/quick-action-ping.client";
import sidePanelDemoPlugin from "./app/plugins/side-panel-demo";
import sidebarWidgetDemoPlugin from "./app/plugins/sidebar-widget-demo";
import signInLinksDemoPlugin from "./app/plugins/sign-in-links-demo";
import tableViewCardsDisplayPlugin from "./app/plugins/table-view-cards-display";

interface VueModule {
  default: Component;
}

const components = import.meta.glob<VueModule>("./app/components/**/*.vue");

function componentName(path: string): string {
  const file = path.split("/").at(-1) ?? path;
  return file.replace(/\.vue$/, "");
}

// No `componentPrefix`, although a published module should set one: every
// page of the playground names its components bare in `CustomComponent(...)`,
// and so do the plugins (`component: "SidePanelDemo"`). Adding the prefix
// means renaming them all in one change.
const playgroundFrontend: DmsFrontendModule = {
  setup(sdk) {
    sdk.registerPlugin(appWidgetDemoPlugin);
    sdk.registerPlugin(commandPaletteAssistantDemoPlugin, { clientOnly: true });
    sdk.registerPlugin(commandPaletteSourceDemoPlugin, { clientOnly: true });
    sdk.registerPlugin(dmsPageSetupDemoPlugin, { clientOnly: true });
    sdk.registerPlugin(featurePaletteSourcePlugin, { clientOnly: true });
    sdk.registerPlugin(flagDisplayPlugin);
    sdk.registerPlugin(headerActionDemoPlugin, { clientOnly: true });
    sdk.registerPlugin(pageValidationDemoPlugin);
    sdk.registerPlugin(quickActionPingPlugin, { clientOnly: true });
    sdk.registerPlugin(sidePanelDemoPlugin);
    sdk.registerPlugin(sidebarWidgetDemoPlugin);
    sdk.registerPlugin(signInLinksDemoPlugin);
    sdk.registerPlugin(tableViewCardsDisplayPlugin);
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
