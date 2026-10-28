import { describe, expect, it } from "vitest";
import { findNavigableCategory } from "../layers/dms-layout/app/composables/page/useSiteLayout";
import type { SiteLayout } from "../layers/dms-layout/app/types/page";

const layout = {
  pages: {},
  categories: {
    projects: {
      id: "projects",
      fullId: "projects",
      fullSlug: "/projects",
      displayName: "Projects",
    },
    "projects.reports": {
      id: "reports",
      fullId: "projects.reports",
      fullSlug: "/projects",
      displayName: "Reports",
      categoryId: "projects",
      urlTransparent: true,
    },
  },
} satisfies SiteLayout;

describe("the category a URL resolves to", () => {
  it("is the one owning the slug, by its full slug", () => {
    expect(findNavigableCategory(layout, "/projects")?.fullId).toBe("projects");
  });

  it("is never a transparent category, nor an unknown slug", () => {
    expect(findNavigableCategory(layout, "/reports")).toBeUndefined();
    const transparentOnly = {
      pages: {},
      categories: { "projects.reports": layout.categories["projects.reports"] },
    } satisfies SiteLayout;
    expect(findNavigableCategory(transparentOnly, "/projects")).toBeUndefined();
  });
});
