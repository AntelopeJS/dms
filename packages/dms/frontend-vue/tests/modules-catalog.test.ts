import { describe, expect, it } from "vitest";
import type {
  ModuleCatalogEntry,
  ModuleWithAccess,
  PageInfo,
  SiteLayoutTree,
} from "../layers/dms-layout/app/types/page";
import {
  MODULE_CATEGORY_ALL,
  MODULE_CATEGORY_OTHER,
  filterModules,
  findModulePageMatch,
  moduleCategoryOptions,
  parseModuleSortMode,
  recentModules,
  sortModules,
  summarizeModules,
} from "../layers/dms-layout/app/build/utils/modules-catalog";

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

  it("orders shown names as the locale does, accents only breaking ties", () => {
    const titled = [
      entry("media", { title: "Médiathèque" }),
      entry("mailing", { title: "Mailing" }),
      entry("marketing", { title: "marketing" }),
      entry("zones", { title: "Zones" }),
    ];
    expect(
      sortModules(titled, "name", new Map(), resolve, "fr-FR").map((m) => m.id),
    ).toEqual(["mailing", "marketing", "media", "zones"]);
  });

  it("falls back to the runtime's order for an unknown locale", () => {
    expect(
      sortModules(modules, "name", new Map(), resolve, "not a locale!").map(
        (m) => m.id,
      ),
    ).toEqual(["ai", "automation", "database", "legacy", "media"]);
  });
});

describe("parseModuleSortMode", () => {
  it("opens alphabetical, keeping a remembered choice", () => {
    expect(parseModuleSortMode(undefined)).toBe("name");
    expect(parseModuleSortMode("recent")).toBe("recent");
    expect(parseModuleSortMode("name")).toBe("name");
  });

  it("reads a tampered value as the default", () => {
    expect(parseModuleSortMode("oldest")).toBe("name");
    expect(parseModuleSortMode({ mode: "recent" })).toBe("name");
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
      categoryId: "saas.billing",
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

  const layout = {
    pages,
    categories: {
      "saas.billing": {
        id: "billing",
        fullId: "saas.billing",
        fullSlug: "/modules/saas/billing",
        displayName: "Billing",
      },
    },
  };

  it("finds an openable page of an installed module and its section", () => {
    expect(
      findModulePageMatch(layout, "invoice", new Set(["saas"]), resolve),
    ).toEqual({
      moduleId: "saas",
      path: "/modules/saas/billing/invoices",
      pageTitle: "Invoices",
      sectionTitle: "Billing",
    });
  });

  it("ignores hidden pages, parameterised pages and other modules", () => {
    expect(
      findModulePageMatch(layout, "detail", new Set(["saas"]), resolve),
    ).toBeNull();
    expect(
      findModulePageMatch(layout, "invoices", new Set(["hidden"]), resolve),
    ).toBeNull();
  });
});

describe("recentModules", () => {
  const landingTree = (moduleId: string, slugs: string[]): SiteLayoutTree => {
    const pages = slugs.map((fullSlug, index) => ({
      id: `page-${index}`,
      fullSlug,
      layoutUrl: "/layout",
      children: {},
      childrenOrders: [],
    }));
    const root = {
      id: moduleId,
      fullSlug: `/modules/${moduleId}`,
      isModuleRoot: true,
      children: Object.fromEntries(pages.map((page) => [page.id, page])),
      childrenOrders: pages.map((page) => page.id),
    };
    return {
      id: "",
      fullSlug: "/",
      children: {
        modules: {
          id: "modules",
          fullSlug: "/modules",
          children: { [moduleId]: root },
          childrenOrders: [moduleId],
        },
      },
      childrenOrders: ["modules"],
    } as unknown as SiteLayoutTree;
  };
  const cms = {
    id: "cms",
    title: "$cms.title",
    icon: "i-ph-article",
    hasAccess: true,
  } as ModuleWithAccess;

  it("opens a recent module on its landing page, not where it was left", () => {
    const tree = landingTree("cms", [
      "/modules/cms/pages",
      "/modules/cms/media",
    ]);
    const recent = recentModules(
      [{ moduleId: "cms", path: "/modules/cms/media", visitedAt: 1 }],
      { cms },
      tree,
    );
    expect(recent).toEqual([
      {
        moduleId: "cms",
        title: "$cms.title",
        icon: "i-ph-article",
        to: "/modules/cms/pages",
      },
    ]);
  });

  it("lists the most recent first and leaves out modules the caller cannot open", () => {
    const tree = landingTree("cms", ["/modules/cms/pages"]);
    const crm = { ...cms, id: "crm", hasAccess: false };
    const recent = recentModules(
      [
        { moduleId: "crm", path: "/modules/crm", visitedAt: 2 },
        { moduleId: "cms", path: "/modules/cms/pages", visitedAt: 1 },
        { moduleId: "gone", path: "/modules/gone", visitedAt: 3 },
      ],
      { cms, crm },
      tree,
    );
    expect(recent.map((module) => module.moduleId)).toEqual(["cms"]);
  });
});
