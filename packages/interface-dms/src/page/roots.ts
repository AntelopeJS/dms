import { DefaultLayout } from "../base/layouts";
import { internal } from "./categories";
import { RootPageController } from "./controllers";
import { moduleDefaultCategories, moduleRootCategories } from "./registry";
import type { CategoryInfo, ModuleInfo } from "./types";

export function RegisterModule(opts: ModuleInfo): CategoryInfo {
  if (moduleRootCategories.has(opts.id)) {
    throw new Error(`Module "${opts.id}" is already registered.`);
  }

  const moduleRoot = internal.RootCategory(opts.id, {
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
    const defaultCategory = internal.RootCategory("pages", {
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

export const pagesCategory = internal.RootCategory("pages", {
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

export const settingsCategory = RootPageController(
  "settings",
  {
    displayName: "$page.settings.title",
    description: "$page.settings.intro",
    urlSlug: "/settings",
    icon: "i-ph-gear",
    order: 3,
    noComponentPermissions: true,
  },
  DefaultLayout(),
);
