/**
 * A module's own address (`/modules/<id>`) has no page: the navigation that
 * enters it goes to the module's landing page instead — its `landingPage`
 * when the caller may open it, else its first page — keeping the query and
 * the hash it was entered with. The middleware answers the landing page
 * rather than navigating to it, so the module's address never renders and,
 * in a server render, becomes the response's redirect.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { MODULE_URL_PREFIX } from "../layers/dms-layout/app/types/page";

interface TreeNode {
  id: string;
  fullSlug: string;
  layoutUrl?: string;
  hasAccess?: boolean;
  isModuleRoot?: boolean;
  children: Record<string, TreeNode>;
  childrenOrders: string[];
}

type Middleware = (to: { path: string; fullPath: string }) => Promise<unknown>;

const navigateDms = vi.fn();

function node(
  id: string,
  fullSlug: string,
  children: TreeNode[] = [],
  page: Partial<TreeNode> = {},
): TreeNode {
  return {
    id,
    fullSlug,
    children: Object.fromEntries(children.map((child) => [child.id, child])),
    childrenOrders: children.map((child) => child.id),
    ...page,
  };
}

const PAGE = { layoutUrl: "/layout" };

function treeOf(moduleRoot: TreeNode): TreeNode {
  return node("", "/", [node("modules", "/modules", [moduleRoot])]);
}

const apiModule = (pages: Partial<Record<string, Partial<TreeNode>>> = {}) =>
  node(
    "api",
    "/modules/api",
    [
      node("monitor", "/modules/api", [
        node("routes", "/modules/api/routes", [], { ...PAGE, ...pages.routes }),
        node("overview", "/modules/api/overview", [], {
          ...PAGE,
          ...pages.overview,
        }),
      ]),
    ],
    { isModuleRoot: true },
  );

function stubSiteLayout(moduleRoot: TreeNode, landingPage?: string) {
  vi.stubGlobal("useSiteLayout", () => ({
    siteLayout: ref({}),
    siteLayoutTree: ref(treeOf(moduleRoot)),
    modules: ref({ api: { id: "api", hasAccess: true, landingPage } }),
    findMatchingRoute: (path: string) =>
      path.startsWith("/modules/api/") ? { metadata: {} } : null,
    loadSiteLayout: vi.fn(),
  }));
}

async function enter(fullPath: string): Promise<unknown> {
  const middleware = (
    await import("../layers/dms-layout/app/middleware/module-routing.global")
  ).default as unknown as Middleware;
  const path = fullPath.replace(/[?#].*$/, "");
  return middleware({ path, fullPath });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("defineDmsMiddleware", (handler: Middleware) => handler);
  vi.stubGlobal("MODULE_URL_PREFIX", MODULE_URL_PREFIX);
  vi.stubGlobal("navigateDms", navigateDms);
  vi.stubGlobal("useHomepage", () => "/dashboard");
  vi.stubGlobal("useModuleHistory", () => ({ record: vi.fn() }));
  vi.stubGlobal("createError", (error: unknown) => error);
});

afterEach(() => {
  navigateDms.mockReset();
  vi.unstubAllGlobals();
});

describe("entering a module", () => {
  it("goes to the module's landingPage", async () => {
    stubSiteLayout(apiModule(), "overview");
    expect(await enter("/modules/api")).toBe("/modules/api/overview");
    expect(navigateDms).not.toHaveBeenCalled();
  });

  it("keeps the query and the hash it was entered with", async () => {
    stubSiteLayout(apiModule(), "overview");
    expect(await enter("/modules/api?live=0#errors")).toBe(
      "/modules/api/overview?live=0#errors",
    );
  });

  it("goes to the first page when there is no landingPage", async () => {
    stubSiteLayout(apiModule());
    expect(await enter("/modules/api")).toBe("/modules/api/routes");
  });

  it("goes to the first page the caller may open when the landingPage is closed to them", async () => {
    stubSiteLayout(apiModule({ overview: { hasAccess: false } }), "overview");
    expect(await enter("/modules/api")).toBe("/modules/api/routes");
  });

  it("sends to the homepage a caller who may open none of its pages", async () => {
    stubSiteLayout(
      apiModule({
        routes: { hasAccess: false },
        overview: { hasAccess: false },
      }),
      "overview",
    );
    await enter("/modules/api");
    expect(navigateDms).toHaveBeenCalledWith("/dashboard", { replace: true });
  });

  it("leaves a module page alone", async () => {
    stubSiteLayout(apiModule(), "overview");
    expect(await enter("/modules/api/routes?tab=tester")).toBeUndefined();
    expect(navigateDms).not.toHaveBeenCalled();
  });
});
