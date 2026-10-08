import { DefaultLayout, SettingsLayout } from "../base/layouts";
import { internal } from "./categories";
import { RootCategory } from "./internal/categories";
import { Category, RootPageController } from "./controllers";
import {
  moduleDefaultCategories,
  moduleRootCategories,
} from "./internal/registry";
import type { CategoryInfo, ModuleInfo } from "./types";

export function RegisterModule(opts: ModuleInfo): CategoryInfo {
  if (moduleRootCategories.has(opts.id)) {
    throw new Error(`Module "${opts.id}" is already registered.`);
  }

  const moduleRoot = RootCategory(opts.id, {
    displayName: opts.title,
    description: opts.description,
    icon: opts.icon,
    urlSlug: opts.id,
    type: "label",
    isModuleRoot: true,
    category: modulesCategory,
  });

  moduleRootCategories.set(opts.id, moduleRoot);

  if (opts.defaultCategory) {
    const defaultCategory = RootCategory("pages", {
      // Treat an empty string the same as omitted: fall back to the built-in
      // i18n label rather than rendering a blank heading.
      displayName: opts.defaultCategory.displayName || "$menu.section.pages",
      icon: opts.defaultCategory.icon,
      order: opts.defaultCategory.order,
      urlSlug: opts.defaultCategory.urlSlug ?? "pages",
      type: "label",
      category: moduleRoot,
    });
    moduleDefaultCategories.set(opts.id, defaultCategory);
  }

  internal.RegisterModule.register(opts);

  return moduleRoot;
}

export const pagesCategory = RootCategory("pages", {
  displayName: "$menu.section.pages",
  urlSlug: "/",
  order: 1,
  type: "label",
});

export const modulesCategory = RootPageController(
  "modules",
  {
    displayName: "$modules.title",
    description: "$modules.intro",
    urlSlug: "/modules",
    icon: "i-ph-squares-four",
    order: 2,
    noComponentPermissions: true,
    isModuleRoot: true,
  },
  DefaultLayout(),
);

/**
 * The settings root, whose page is the settings overview. Every member opens
 * it (`memberAccess`): each of them holds account settings, and the overview
 * lists only the pages its caller can open. The pages declared under it keep
 * their own grant — a page does not pass `memberAccess` on to the pages filed
 * under it, only a category does.
 */
export const settingsCategory = RootPageController("settings", {
  displayName: "$page.settings.title",
  description: "$page.settings.intro",
  urlSlug: "/settings",
  icon: "i-ph-gear",
  order: 3,
  noComponentPermissions: true,
  memberAccess: true,
  layout: SettingsLayout(),
});

/**
 * The settings of the workspace as a whole — members, invitations, roles —
 * next to the account settings each user keeps for themselves. A project adds
 * its workspace settings here (`category: workspaceSettingsCategory`) rather
 * than declaring a `settings.workspace` category of its own. A page declaring
 * a `module` cannot: registration throws for any page of a module under the
 * settings root. A module keeps its settings in its own sidebar, or
 * registers a workspace settings page without `module`.
 */
export const workspaceSettingsCategory = Category("workspace", {
  category: settingsCategory,
  displayName: "$page.settings.shell.workspace",
  description: "$page.settings.overview.workspace_description",
  urlSlug: "workspace",
  icon: "i-ph-buildings",
  order: 2,
});
