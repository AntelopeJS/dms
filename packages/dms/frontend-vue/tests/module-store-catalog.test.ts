import { describe, expect, it } from "vitest";
import {
  MODULE_CATEGORY_ALL,
  filterModules,
  moduleCategoryOptions,
} from "../layers/dms-layout/app/build/utils/modules-catalog";
import {
  type ModuleStoreEntry,
  filterByScope,
  isAwaitingFrontend,
  needsDependencyChoice,
  sortStoreModules,
  storeActionBlock,
  installedTileStatus,
  storeActions,
  storeBlockMessage,
  storeOpenTarget,
  toModuleStoreEntry,
  withStoreDetails,
} from "../layers/dms-layout/app/build/utils/module-store-catalog";
import {
  OTHER_PACKAGE_CHOICE,
  areDependencyDraftsValid,
  buildInstallBody,
  createDependencyDrafts,
  isNpmPackageName,
  parseDependencyConfig,
  validateDependencyDraft,
} from "../layers/dms-layout/app/build/utils/module-store-install";
import type {
  MissingInterface,
  StoreListingEntry,
} from "../layers/dms-layout/app/types/module-store";
import catalogDocument from "../../data/module-store/catalog.json";
import en from "../layers/dms-layout/i18n/locales/layout-en-GB.json";
import fr from "../layers/dms-layout/i18n/locales/layout-fr-FR.json";

type Messages = Record<string, unknown>;

function lookup(messages: Messages, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Messages)[part] : undefined,
      messages,
    );
}

// Resolves `$i18n.key` display strings against the English catalog, like
// processI18n does in the app.
const resolve = (value: string): string => {
  if (!value.startsWith("$")) return value;
  const text = lookup(en, value.slice(1));
  return typeof text === "string" ? text : value;
};

function listingEntry(
  id: string,
  overrides: Partial<StoreListingEntry> = {},
): StoreListingEntry {
  return {
    id,
    package: `@antelopejs/dms-${id}`,
    icon: "i-ph-cube",
    category: "data",
    title: id[0].toUpperCase() + id.slice(1),
    description: `${id} description`,
    state: "available",
    updateAvailable: false,
    compatible: true,
    frontend: "none",
    missingInterfaces: [],
    dependents: [],
    ...overrides,
  };
}

function storeEntry(
  id: string,
  overrides: Partial<ModuleStoreEntry> = {},
): ModuleStoreEntry {
  return {
    ...toModuleStoreEntry(listingEntry(id)),
    catalogCategory: "Data",
    ...overrides,
  };
}

const catalog = [
  storeEntry("media", {
    catalogCategory: "Content",
    description: "Asset library",
  }),
  storeEntry("database", { state: "active", installedVersion: "0.1.2" }),
  storeEntry("lang", { title: "Translations", catalogCategory: "Content" }),
  storeEntry("ai", {
    catalogCategory: "AI",
    state: "disabled",
    installedVersion: "0.2.1",
  }),
];

const actionKinds = (entry: StoreListingEntry) =>
  storeActions(entry).map((action) => action.kind);

describe("module store catalog", () => {
  it("uses the registered module title for display, search and sorting", () => {
    const installed = [
      { id: "media", title: "$dms_media.title" },
      { id: "ai", title: "Assistant" },
    ];
    const entries = [
      listingEntry("ai", { title: "Z-old catalog name" }),
      listingEntry("media", { title: "Médias" }),
      listingEntry("builder", { title: "Builder" }),
    ].map((entry) => toModuleStoreEntry(entry, installed));

    expect(entries.map((entry) => entry.title)).toEqual([
      "Assistant",
      "$dms_media.title",
      "Builder",
    ]);
    const translate = (value: string) =>
      value === "$dms_media.title" ? "Médiathèque" : value;
    expect(
      sortStoreModules(entries, translate).map((entry) => entry.id),
    ).toEqual(["ai", "builder", "media"]);
    expect(
      filterModules(entries, {
        query: "Médiathèque",
        category: MODULE_CATEGORY_ALL,
        resolve: translate,
      }).map((entry) => entry.id),
    ).toEqual(["media"]);
    expect(toModuleStoreEntry(listingEntry("ai"), []).title).toBe("Ai");
  });

  it("keeps unloaded module names aligned with their English and French registrations", () => {
    expect(en.modules.store.catalog.ai.title).toBe("Assistant");
    expect(fr.modules.store.catalog.ai.title).toBe("Assistant");
    expect(en.modules.store.catalog.media.title).toBe("Media");
    expect(fr.modules.store.catalog.media.title).toBe("Médiathèque");
  });

  it("sorts the modules by their shown name", () => {
    expect(
      sortStoreModules(catalog, resolve).map((entry) => entry.title),
    ).toEqual(["Ai", "Database", "Media", "Translations"]);
  });

  it("splits installed modules, paused ones included, from available ones", () => {
    expect(
      filterByScope(catalog, "installed").map((entry) => entry.id),
    ).toEqual(["database", "ai"]);
    expect(
      filterByScope(catalog, "available").map((entry) => entry.id),
    ).toEqual(["media", "lang"]);
    expect(filterByScope(catalog, "all")).toHaveLength(4);
  });

  it("counts a failed install as available, a failed update as installed", () => {
    const failedInstall = listingEntry("api", { state: "error" });
    const failedUpdate = listingEntry("api", {
      state: "error",
      installedVersion: "0.3.0",
    });
    expect(filterByScope([failedInstall], "available")).toHaveLength(1);
    expect(filterByScope([failedUpdate], "installed")).toHaveLength(1);
    expect(actionKinds(failedInstall)).toEqual(["install"]);
    expect(actionKinds(failedUpdate)).toEqual(["apply", "uninstall"]);
  });

  it("offers each state its actions, the main one first", () => {
    expect(actionKinds(listingEntry("a"))).toEqual(["install"]);
    expect(actionKinds(listingEntry("a", { state: "active" }))).toEqual([
      "disable",
      "uninstall",
    ]);
    expect(
      actionKinds(
        listingEntry("a", { state: "active", updateAvailable: true }),
      ),
    ).toEqual(["update", "disable", "uninstall"]);
    expect(actionKinds(listingEntry("a", { state: "disabled" }))).toEqual([
      "enable",
      "uninstall",
    ]);
    expect(actionKinds(listingEntry("a", { state: "busy" }))).toEqual([]);
  });

  it("asks for confirmation before uninstalling only", () => {
    const confirmed = storeActions(listingEntry("a", { state: "disabled" }))
      .filter((action) => action.confirm)
      .map((action) => action.kind);
    expect(confirmed).toEqual(["uninstall"]);
  });

  it("says an installed module's state on its pill, the store's first", () => {
    const module = {
      id: "a",
      title: "A",
      description: "",
      icon: "i-ph-cube",
      hasAccess: true,
      landingSlug: "/modules/a/home",
    };
    const pill = (overrides: Partial<StoreListingEntry>) =>
      installedTileStatus(module, listingEntry("a", overrides));
    expect(pill({ state: "active" })).toEqual({
      tone: "success",
      labelKey: "modules.status.live",
    });
    expect(pill({ state: "disabled" })).toEqual({
      tone: "warning",
      labelKey: "modules.store.state.disabled",
    });
    expect(pill({ state: "error" }).tone).toBe("error");
    expect(pill({ state: "busy" }).dot).toBe("live");
    expect(pill({ state: "active", updateAvailable: true }).labelKey).toBe(
      "modules.status.update",
    );
    expect(pill({ state: "active", frontend: "pending" }).labelKey).toBe(
      "modules.status.restart_required",
    );
    expect(
      installedTileStatus({ ...module, status: "attention" }, undefined)
        .labelKey,
    ).toBe("modules.status.attention");
  });

  it("words why a store action waits", () => {
    const t = (key: string, params?: Record<string, string>) =>
      `${key}${params ? JSON.stringify(params) : ""}`;
    const used = listingEntry("a", {
      state: "active",
      usedByProject: true,
      latestVersion: "1.0.0",
    });
    expect(storeBlockMessage(used, "uninstall", t)).toBe(
      "modules.store.used_by_project",
    );
    expect(storeBlockMessage(used, "update", t)).toBeUndefined();
  });

  it("names every source in both locales", () => {
    for (const messages of [en, fr]) {
      for (const source of ["npm", "github", "gitlab", "git", "local"]) {
        expect(lookup(messages, `modules.source.${source}`)).toEqual(
          expect.any(String),
        );
      }
    }
  });

  it("waits on the frontend only once the operation is over", () => {
    expect(isAwaitingFrontend(listingEntry("a", { frontend: "pending" }))).toBe(
      true,
    );
    expect(
      isAwaitingFrontend(
        listingEntry("a", { state: "busy", frontend: "pending" }),
      ),
    ).toBe(false);
    expect(isAwaitingFrontend(listingEntry("a", { frontend: "unknown" }))).toBe(
      false,
    );
  });

  it("searches the name, description, category and id", () => {
    const search = (query: string) =>
      filterModules(catalog, {
        query,
        category: MODULE_CATEGORY_ALL,
        resolve,
      }).map((entry) => entry.id);
    expect(search("translat")).toEqual(["lang"]);
    expect(search("ASSET")).toEqual(["media"]);
    expect(search("content")).toEqual(["media", "lang"]);
    expect(search("  ai ")).toEqual(["ai"]);
    expect(search("payments")).toEqual([]);
  });

  it("offers the categories present, with their counts", () => {
    expect(moduleCategoryOptions(catalog, resolve)).toEqual([
      { value: "AI", label: "AI", count: 1 },
      { value: "Content", label: "Content", count: 2 },
      { value: "Data", label: "Data", count: 1 },
    ]);
  });

  it("merges two category keys that read the same into one option", () => {
    const sameName = [
      storeEntry("media", {
        catalogCategory: "$modules.store.category.content",
      }),
      storeEntry("lang", { catalogCategory: "Content" }),
      storeEntry("database"),
    ];
    const options = moduleCategoryOptions(sameName, resolve);
    expect(options.map((option) => [option.label, option.count])).toEqual([
      ["Content", 2],
      ["Data", 1],
    ]);
    expect(
      filterModules(sameName, {
        query: "",
        category: options[0].value,
        resolve,
      }).map((entry) => entry.id),
    ).toEqual(["media", "lang"]);
  });

  it("shows a working copy as active and installed, with no action", () => {
    const entry = listingEntry("media", {
      state: "active",
      installedVersion: "0.5.0",
      isWorkingCopy: true,
    });
    expect(filterByScope([entry], "installed")).toEqual([entry]);
    expect(storeActions(entry)).toEqual([]);
  });

  it("fills the version and category an installed module does not register", () => {
    const installed = [
      {
        id: "media",
        title: "Media",
        description: "",
        icon: "i-ph-image",
        hasAccess: true,
        landingSlug: "/modules/media",
      },
      {
        id: "api",
        title: "API",
        description: "",
        icon: "i-ph-plug",
        hasAccess: true,
        landingSlug: "/modules/api",
        version: "0.4.1",
        catalogCategory: "$api.category",
      },
    ];
    const store = [
      listingEntry("media", {
        category: "content",
        installedVersion: "0.5.0",
        source: "npm",
      }),
      listingEntry("api", { installedVersion: "0.9.0", source: "github" }),
    ];
    const [media, api] = withStoreDetails(installed, store);
    expect(media.version).toBe("0.5.0");
    expect(media.source).toBe("npm");
    expect(api.source).toBe("github");
    expect(media.catalogCategory).toBe("$modules.store.category.content");
    expect(api.version).toBe("0.4.1");
    expect(api.catalogCategory).toBe("$api.category");
    // A declared range is not a version a tile can print.
    expect(
      withStoreDetails(installed, [
        listingEntry("media", { installedVersion: "^0.5.0" }),
      ])[0].version,
    ).toBeUndefined();
  });
});

const REDIS: MissingInterface = {
  interfacePackage: "@antelopejs/interface-redis",
  candidates: [
    { name: "redis", package: "@antelopejs/redis" },
    { name: "valkey", package: "@antelopejs/valkey" },
  ],
};
const QUEUE: MissingInterface = {
  interfacePackage: "@antelopejs/interface-queue",
  candidates: [],
};

const FRONTEND_REQUIREMENT = {
  range: ">=0.7.0",
  running: "0.6.0",
  target: "0.7.2",
  command: "pnpm add @antelopejs/dms-frontend@0.7.2",
  breaks: [],
};

describe("module store blocked actions", () => {
  const released = (overrides: Partial<StoreListingEntry> = {}) =>
    listingEntry("cache", { latestVersion: "1.0.0", ...overrides });

  it("lets a releasable module install and update", () => {
    expect(storeActionBlock(released(), "install")).toBeUndefined();
    expect(storeActionBlock(released(), "update")).toBeUndefined();
  });

  it("blocks a release without a version, on another interface or dms-frontend", () => {
    expect(storeActionBlock(listingEntry("cache"), "install")).toBe(
      "no_release",
    );
    expect(storeActionBlock(released({ compatible: false }), "update")).toBe(
      "incompatible",
    );
    expect(
      storeActionBlock(
        released({ frontendRequirement: FRONTEND_REQUIREMENT }),
        "install",
      ),
    ).toBe("frontend");
  });

  it("asks for the missing interfaces on install, refuses them on update", () => {
    const missing = released({ missingInterfaces: [REDIS] });
    expect(storeActionBlock(missing, "install")).toBeUndefined();
    expect(needsDependencyChoice(missing, "install")).toBe(true);
    expect(storeActionBlock(missing, "update")).toBe("interfaces");
    expect(needsDependencyChoice(missing, "update")).toBe(false);
    expect(needsDependencyChoice(released(), "install")).toBe(false);
  });

  it("keeps a module others need from being paused or removed", () => {
    const needed = released({ state: "active", dependents: ["@acme/jobs"] });
    expect(storeActionBlock(needed, "disable")).toBe("dependents");
    expect(storeActionBlock(needed, "uninstall")).toBe("dependents");
    expect(storeActionBlock(needed, "enable")).toBeUndefined();
    expect(
      storeActionBlock(released({ state: "active" }), "uninstall"),
    ).toBeUndefined();
  });

  it("explains that the project's own code, not a module, holds a module", () => {
    const used = released({
      state: "active",
      usedByProject: true,
      dependents: ["@acme/jobs"],
    });
    expect(storeActionBlock(used, "disable")).toBe("used_by_project");
    expect(storeActionBlock(used, "uninstall")).toBe("used_by_project");
    expect(storeActionBlock(used, "update")).toBeUndefined();
  });

  it("words every block in both locales", () => {
    for (const messages of [en, fr]) {
      for (const key of [
        "modules.store.used_by_project",
        "modules.store.dependents",
        "modules.store.errors.store_module_used_by_project",
      ]) {
        expect(lookup(messages, key)).toEqual(expect.any(String));
      }
    }
  });
});

describe("module store install dialog", () => {
  it("accepts npm package names only", () => {
    expect(isNpmPackageName("redis")).toBe(true);
    expect(isNpmPackageName("@antelopejs/redis")).toBe(true);
    expect(isNpmPackageName("Redis")).toBe(false);
    expect(isNpmPackageName("git+https://github.com/a/b.git")).toBe(false);
    expect(isNpmPackageName("./local/module")).toBe(false);
    expect(isNpmPackageName("@scope")).toBe(false);
    expect(isNpmPackageName("a".repeat(215))).toBe(false);
  });

  it("reads an empty config as none and refuses anything but an object", () => {
    expect(parseDependencyConfig("  ")).toEqual({ isValid: true });
    expect(parseDependencyConfig('{ "url": "redis://cache" }')).toEqual({
      isValid: true,
      config: { url: "redis://cache" },
    });
    expect(parseDependencyConfig("[]").isValid).toBe(false);
    expect(parseDependencyConfig("null").isValid).toBe(false);
    expect(parseDependencyConfig("{ url: }").isValid).toBe(false);
  });

  it("preselects the first candidate, or the other package without one", () => {
    expect(
      createDependencyDrafts([REDIS, QUEUE]).map((draft) => draft.choice),
    ).toEqual(["@antelopejs/redis", OTHER_PACKAGE_CHOICE]);
  });

  it("keeps what an earlier attempt picked for the same interface", () => {
    const [earlier] = createDependencyDrafts([REDIS]);
    const edited = { ...earlier!, choice: "@antelopejs/valkey", config: "{}" };
    expect(createDependencyDrafts([REDIS, QUEUE], [edited])[0]).toEqual(edited);
  });

  it("flags a missing or invalid package and a config that is not an object", () => {
    const [draft] = createDependencyDrafts([QUEUE]);
    expect(validateDependencyDraft(draft!)).toEqual({
      package: "package_required",
    });
    expect(
      validateDependencyDraft({
        ...draft!,
        otherPackage: "github:acme/queue",
        config: "[1]",
      }),
    ).toEqual({ package: "package_invalid", config: "config_invalid" });
    expect(
      areDependencyDraftsValid([{ ...draft!, otherPackage: " @acme/queue " }]),
    ).toBe(true);
  });

  it("builds the install body, leaving out an empty config", () => {
    const [redis, queue] = createDependencyDrafts([REDIS, QUEUE]);
    expect(
      buildInstallBody("cache", [
        redis!,
        { ...queue!, otherPackage: "@acme/queue", config: '{"size":2}' },
      ]),
    ).toEqual({
      id: "cache",
      dependencies: [
        {
          interfacePackage: "@antelopejs/interface-redis",
          package: "@antelopejs/redis",
        },
        {
          interfacePackage: "@antelopejs/interface-queue",
          package: "@acme/queue",
          config: { size: 2 },
        },
      ],
    });
    expect(buildInstallBody("cache", [])).toEqual({ id: "cache" });
  });
});

describe("bundled module catalog", () => {
  const entries = catalogDocument.modules.map((entry) =>
    toModuleStoreEntry(listingEntry(entry.id, { category: entry.category })),
  );

  it("has unique ids and packages", () => {
    const ids = catalogDocument.modules.map((entry) => entry.id);
    const packages = catalogDocument.modules.map((entry) => entry.package);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(packages).size).toBe(packages.length);
  });

  it("translates every name, description and category in both locales", () => {
    for (const messages of [en, fr]) {
      for (const entry of entries) {
        for (const key of [
          `$modules.store.catalog.${entry.id}.title`,
          `$modules.store.catalog.${entry.id}.description`,
          entry.catalogCategory,
        ]) {
          expect(typeof lookup(messages, key.slice(1)), key).toBe("string");
        }
      }
    }
  });
});

describe("storeOpenTarget", () => {
  const installed = [
    { id: "cms", hasAccess: true, landingSlug: "/modules/cms/pages" },
    { id: "jobs", hasAccess: true, landingSlug: "/modules/jobs" },
    { id: "crm", hasAccess: false, landingSlug: "/modules/crm/leads" },
  ];

  it("opens an installed module on its landing page", () => {
    expect(storeOpenTarget({ id: "cms" }, installed)).toBe(
      "/modules/cms/pages",
    );
  });

  it("offers no Open button for a module without pages, out of reach or not running", () => {
    expect(storeOpenTarget({ id: "jobs" }, installed)).toBeUndefined();
    expect(storeOpenTarget({ id: "crm" }, installed)).toBeUndefined();
    expect(storeOpenTarget({ id: "media" }, installed)).toBeUndefined();
  });
});
