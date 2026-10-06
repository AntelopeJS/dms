import { describe, expect, it } from "vitest";
import {
  MODULE_CATEGORY_ALL,
  filterModules,
  moduleCategoryOptions,
} from "../layers/dms-layout/app/build/utils/modules-catalog";
import {
  MODULE_STORE_CATALOG,
  availableStoreModules,
  moduleInstallCommand,
  type ModuleStoreEntry,
} from "../layers/dms-layout/app/build/utils/module-store-catalog";
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

function storeEntry(
  id: string,
  overrides: Partial<ModuleStoreEntry> = {},
): ModuleStoreEntry {
  return {
    id,
    packageName: `@antelopejs/dms-${id}`,
    title: id[0].toUpperCase() + id.slice(1),
    description: `${id} description`,
    icon: "i-ph-cube",
    catalogCategory: "Data",
    ...overrides,
  };
}

const catalog = [
  storeEntry("media", {
    catalogCategory: "Content",
    description: "Asset library",
  }),
  storeEntry("database"),
  storeEntry("lang", { title: "Translations", catalogCategory: "Content" }),
  storeEntry("ai", { catalogCategory: "AI" }),
];

describe("module store catalog", () => {
  it("hides the modules already installed", () => {
    const available = availableStoreModules(
      catalog,
      new Set(["database", "demo"]),
      resolve,
    );
    expect(available.map((entry) => entry.id)).toEqual(["ai", "media", "lang"]);
  });

  it("lists every module, by name, when none is installed", () => {
    expect(
      availableStoreModules(catalog, new Set(), resolve).map(
        (entry) => entry.title,
      ),
    ).toEqual(["Ai", "Database", "Media", "Translations"]);
  });

  it("is empty once every module is installed", () => {
    const installed = new Set(catalog.map((entry) => entry.id));
    expect(availableStoreModules(catalog, installed, resolve)).toEqual([]);
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

  it("filters by category, combined with the search", () => {
    expect(
      filterModules(catalog, {
        query: "",
        category: "Content",
        resolve,
      }).map((entry) => entry.id),
    ).toEqual(["media", "lang"]);
    expect(
      filterModules(catalog, {
        query: "lang",
        category: "Data",
        resolve,
      }),
    ).toEqual([]);
  });

  it("offers the categories present, with their counts", () => {
    expect(moduleCategoryOptions(catalog, resolve)).toEqual([
      { value: "AI", label: "AI", count: 1 },
      { value: "Content", label: "Content", count: 2 },
      { value: "Data", label: "Data", count: 1 },
    ]);
  });

  it("shows the AntelopeJS CLI command that adds the package", () => {
    expect(moduleInstallCommand(storeEntry("media"))).toBe(
      "ajs project modules add @antelopejs/dms-media",
    );
  });
});

describe("official module list", () => {
  it("has unique ids and packages", () => {
    const ids = MODULE_STORE_CATALOG.map((entry) => entry.id);
    const packages = MODULE_STORE_CATALOG.map((entry) => entry.packageName);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(packages).size).toBe(packages.length);
  });

  it("translates every name, description and category in both locales", () => {
    for (const messages of [en, fr]) {
      for (const entry of MODULE_STORE_CATALOG) {
        for (const key of [
          entry.title,
          entry.description,
          entry.catalogCategory,
        ]) {
          expect(key.startsWith("$")).toBe(true);
          expect(typeof lookup(messages, key.slice(1)), key).toBe("string");
        }
      }
    }
  });
});
