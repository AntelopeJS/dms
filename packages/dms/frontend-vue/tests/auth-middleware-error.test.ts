import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DmsMiddleware, DmsRoute } from "#dms/frontend-module";

// SAFETY: The initial value is null, a member of the nullable error state used by these fixtures.
const pageError = { value: null as { statusCode: number } | null };
const navigateDms = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("defineDmsMiddleware", (handler: DmsMiddleware) => handler);
  vi.stubGlobal("useDmsError", () => pageError);
  vi.stubGlobal("abortDmsNavigation", () => false);
  vi.stubGlobal("navigateDms", navigateDms);
  vi.stubGlobal("useSiteLayout", () => ({
    siteLayout: { value: {} },
    findMatchingRoute: () => ({ metadata: {} }),
  }));
  vi.stubGlobal("useDmsUserSession", () => ({ loggedIn: { value: false } }));
});

afterEach(() => {
  pageError.value = null;
  navigateDms.mockReset();
  vi.unstubAllGlobals();
});

async function loadMiddleware(): Promise<DmsMiddleware> {
  const module = await import("../layers/dms-auth/app/middleware/auth");
  return module.default;
}

const privateRoute: DmsRoute = {
  path: "/projects/project",
  fullPath: "/projects/project",
  query: {},
  params: {},
  matched: [{}],
  meta: { auth: true },
};

describe("auth middleware", () => {
  it("aborts without throwing when the page already raised an error", async () => {
    pageError.value = { statusCode: 404 };
    const middleware = await loadMiddleware();

    await expect(middleware(privateRoute, privateRoute)).resolves.toBe(false);
    expect(navigateDms).not.toHaveBeenCalled();
  });

  it("still sends a signed-out visitor to the login page", async () => {
    const middleware = await loadMiddleware();

    await middleware(privateRoute, privateRoute);

    expect(navigateDms).toHaveBeenCalledWith({
      path: "/auth",
      query: { redirect: "/projects/project" },
    });
  });
});
