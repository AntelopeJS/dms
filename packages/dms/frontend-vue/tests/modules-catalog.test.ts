import { describe, expect, it } from "vitest";
import type {
  ModuleCatalogEntry,
  PageInfo,
} from "../layers/dms-layout/app/types/page";
import {
  MODULE_CATEGORY_ALL,
  MODULE_CATEGORY_OTHER,
  filterModules,
  findModulePageMatch,
  moduleCategoryOptions,
  sortModules,
  summarizeModules,
} from "../layers/dms-layout/app/utils/modules-catalog";

const resolve = (value: string) =>
  value === MODULE_CATEGORY_OTHER ? "Other" : value;

function entry(
  id: string,
  overrides: Partial<ModuleCatalogEntry> = {},
): ModuleCatalogEntry {
  return {
    id,
    title: id[0].toUpperCase() + id.slice(1),
    description: `${id} description`,
    icon: "i-ph-cube",
    hasAccess: true,
    landingSlug: `/modules/${id}`,
    ...overrides,
  };
}

const modules = [
  entry("media", { catalogCategory: "Content", status: "live" }),
  entry("database", { catalogCategory: "Data", status: "update" }),
  entry("automation", { catalogCategory: "Operations", status: "attention" }),
  entry("ai", { status: "beta" }),
  entry("legacy"),
];

describe("summarizeModules", () => {
  it("counts installed modules by status, missing status reading as live", () => {
    expect(summarizeModules(modules)).toEqual({
      installed: 5,
      updates: 1,
      attention: 1,
      beta: 1,
    });
  });
});

describe("moduleCategoryOptions", () => {
  it("lists present categories alphabetically with Other last", () => {
    expect(
      moduleCategoryOptions(modules, resolve).map((o) => [o.label, o.count]),
    ).toEqual([
      ["Content", 1],
      ["Data", 1],
      ["Operations", 1],
      ["Other", 2],
    ]);
  });
});

describe("filterModules", () => {
  it("matches the title, description and category, case-insensitively", () => {
    const ids = (query: string) =>
      filterModules(modules, {
        query,
        category: MODULE_CATEGORY_ALL,
        resolve,
      }).map((m) => m.id);
    expect(ids("DATA")).toEqual(["database"]);
    expect(ids("operations")).toEqual(["automation"]);
    expect(ids("  ")).toHaveLength(5);
  });

  it("narrows to a category, including the Other bucket", () => {
    expect(
      filterModules(modules, {
        query: "",
        category: MODULE_CATEGORY_OTHER,
        resolve,
      }).map((m) => m.id),
    ).toEqual(["ai", "legacy"]);
  });
});

describe("sortModules", () => {
  it("puts recently opened modules first, then the rest by name", () => {
    const visitedAt = new Map([
      ["media", 100],
      ["automation", 300],
    ]);
    expect(
      sortModules(modules, "recent", visitedAt, resolve).map((m) => m.id),
    ).toEqual(["automation", "media", "ai", "database", "legacy"]);
    expect(
      sortModules(modules, "name", visitedAt, resolve).map((m) => m.id),
    ).toEqual(["ai", "automation", "database", "legacy", "media"]);
  });
});

describe("findModulePageMatch", () => {
  const page = (slug: string, extra: Record<string, unknown>): PageInfo =>
    ({
      id: slug,
      fullId: slug,
      fullSlug: slug,
      layoutUrl: `${slug}/pagelayout`,
      displayName: "",
      ...extra,
    }) as unknown as PageInfo;

  const pages = {
    "/modules/saas/billing/invoices": page("/modules/saas/billing/invoices", {
      displayName: "Invoices",
      module: "saas",
      category: { displayName: "Billing" },
    }),
    "/modules/saas/invoice/:id": page("/modules/saas/invoice/:id", {
      displayName: "Invoice detail",
      module: "saas",
    }),
    "/modules/hidden/invoices": page("/modules/hidden/invoices", {
      displayName: "Invoices",
      module: "hidden",
      hidden: true,
    }),
  };

  it("finds an openable page of an installed module and its section", () => {
    expect(
      findModulePageMatch(pages, "invoice", new Set(["saas"]), resolve),
    ).toEqual({
      moduleId: "saas",
      path: "/modules/saas/billing/invoices",
      pageTitle: "Invoices",
      sectionTitle: "Billing",
    });
  });

  it("ignores hidden pages, parameterised pages and other modules", () => {
    expect(
      findModulePageMatch(pages, "detail", new Set(["saas"]), resolve),
    ).toBeNull();
    expect(
      findModulePageMatch(pages, "invoices", new Set(["hidden"]), resolve),
    ).toBeNull();
  });
});
