import { describe, expect, it } from "vitest";
import {
  buildFavoritePage,
  isFavoritePathValid,
} from "../layers/dms-layout/app/utils/favorites";

const translate = (text: string) =>
  text.startsWith("$") ? `t(${text.slice(1)})` : text;

const SETTINGS_PAGE = {
  id: "settings",
  displayName: "$page.settings.title",
  icon: "i-ph-gear",
};
const PROJECT_PAGE = {
  id: "project",
  displayName: "$cloud.project.title",
  icon: "i-ph-cube",
  validation: { requiredQueryParams: ["project"] },
};

const ROUTES: Record<string, typeof SETTINGS_PAGE | typeof PROJECT_PAGE> = {
  "/settings": SETTINGS_PAGE,
  "/projects/project": PROJECT_PAGE,
};
const resolveRoute = (path: string) =>
  ROUTES[path] ? { metadata: ROUTES[path] } : null;

describe("buildFavoritePage", () => {
  it("keeps a plain page on its path and its translatable display name", () => {
    expect(
      buildFavoritePage({
        path: "/settings",
        metadata: SETTINGS_PAGE,
        query: { tab: "general" },
        translate,
        renderedHeading: "Settings",
      }),
    ).toEqual({
      id: "settings",
      path: "/settings",
      title: "$page.settings.title",
      icon: "i-ph-gear",
    });
  });

  it("keeps the query a page requires and names it after its heading", () => {
    expect(
      buildFavoritePage({
        path: "/projects/project",
        metadata: PROJECT_PAGE,
        query: { project: "p 1", service: "s1" },
        translate,
        renderedHeading: "  Storefront \n",
      }),
    ).toEqual({
      id: "/projects/project?project=p+1",
      path: "/projects/project?project=p+1",
      title: "Storefront",
      icon: "i-ph-cube",
    });
  });

  it("falls back to the page name and query values without an entity heading", () => {
    const favorite = (renderedHeading?: string) =>
      buildFavoritePage({
        path: "/projects/project",
        metadata: PROJECT_PAGE,
        query: { project: "p1" },
        translate,
        renderedHeading,
      })?.title;

    expect(favorite()).toBe("t(cloud.project.title) · p1");
    expect(favorite(" ")).toBe("t(cloud.project.title) · p1");
    expect(favorite("t(cloud.project.title)")).toBe(
      "t(cloud.project.title) · p1",
    );
  });

  it("gives no favorite when a required query value is missing", () => {
    expect(
      buildFavoritePage({
        path: "/projects/project",
        metadata: PROJECT_PAGE,
        query: {},
        translate,
      }),
    ).toBe(null);
  });
});

describe("isFavoritePathValid", () => {
  it("accepts favorites of plain pages, with or without a query", () => {
    expect(isFavoritePathValid("/settings", resolveRoute)).toBe(true);
    expect(isFavoritePathValid("/settings?tab=x", resolveRoute)).toBe(true);
  });

  it("accepts a favorite carrying the query its page requires", () => {
    expect(
      isFavoritePathValid("/projects/project?project=p+1", resolveRoute),
    ).toBe(true);
  });

  it("drops favorites that match no page or lack a required query value", () => {
    expect(isFavoritePathValid("/unknown", resolveRoute)).toBe(false);
    expect(isFavoritePathValid("/projects/project", resolveRoute)).toBe(false);
  });
});
