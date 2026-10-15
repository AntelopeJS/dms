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
  sortStoreModules,
  storeActions,
  storeTileStatus,
  toModuleStoreEntry,
} from "../layers/dms-layout/app/build/utils/module-store-catalog";
import type { StoreListingEntry } from "../layers/dms-layout/app/types/module-store";
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
  storeEntry("ai", { catalogCategory: "AI", state: "config" }),
];

const actionKinds = (entry: StoreListingEntry) =>
  storeActions(entry).map((action) => action.kind);

describe("module store catalog", () => {
  it("sorts the modules by their shown name", () => {
    expect(
      sortStoreModules(catalog, resolve).map((entry) => entry.title),
    ).toEqual(["Ai", "Database", "Media", "Translations"]);
  });

  it("splits installed modules, the config's included, from available ones", () => {
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
    expect(actionKinds(listingEntry("a", { state: "config" }))).toEqual([]);
  });

  it("asks for confirmation before uninstalling only", () => {
    const confirmed = storeActions(listingEntry("a", { state: "disabled" }))
      .filter((action) => action.confirm)
      .map((action) => action.kind);
    expect(confirmed).toEqual(["uninstall"]);
  });

  it("flags an update on an active module's pill", () => {
    expect(
      storeTileStatus(
        listingEntry("a", { state: "active", updateAvailable: true }),
      ).labelKey,
    ).toBe("update_available");
    expect(storeTileStatus(listingEntry("a", { state: "busy" })).dot).toBe(
      "live",
    );
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
