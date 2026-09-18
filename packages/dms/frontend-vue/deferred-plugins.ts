import {
  type DmsAppContext,
  type DmsPluginSetup,
} from "#dms/frontend-module";
import dmsMenuSyncPlugin from "./layers/dms-layout/app/plugins/dms-menu-sync.client";
import commandPaletteNavigationPlugin from "./layers/dms-layout/app/plugins/command-palette-navigation.client";
import commandPalettePersonalPagesPlugin from "./layers/dms-layout/app/plugins/command-palette-personal-pages.client";
import commandPaletteQuickActionsPlugin from "./layers/dms-layout/app/plugins/command-palette-quick-actions.client";
import commandPaletteSessionPlugin from "./layers/dms-layout/app/plugins/command-palette-session.client";
import notificationStreamPlugin from "./layers/dms-layout/app/plugins/notification-stream.client";
import profileSyncPlugin from "./layers/dms-layout/app/plugins/profile-sync.client";

const deferredPlugins: DmsPluginSetup[] = [
  dmsMenuSyncPlugin,
  commandPaletteNavigationPlugin,
  commandPalettePersonalPagesPlugin,
  commandPaletteQuickActionsPlugin,
  commandPaletteSessionPlugin,
  notificationStreamPlugin,
  profileSyncPlugin,
];

export async function installDeferredPlugins(
  context: DmsAppContext,
): Promise<void> {
  for (const plugin of deferredPlugins) {
    await context.runWithContext(() => plugin(context));
  }
}
