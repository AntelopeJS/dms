import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Middleware = (
  to: typeof privateRoute,
) => ReturnType<
  typeof import("../layers/dms-auth/app/middleware/auth").default
>;

// SAFETY: The initial value is null, a member of the nullable error state used by these fixtures.
const pageError = { value: null as { statusCode: number } | null };
const navigateDms = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("defineDmsMiddleware", (handler: Middleware) => handler);
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

async function loadMiddleware(): Promise<Middleware> {
  const module = await import("../layers/dms-auth/app/middleware/auth");
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-chained-type-assertions -- The identity middleware stub accepts the partial route fixture used here. The router-owned signature requires unrelated normalized route fields and incompatible matched-record metadata; inference cannot model that deliberately incomplete test boundary.
  return module.default as unknown as Middleware;
}

const privateRoute = {
  path: "/projects/project",
  fullPath: "/projects/project",
  matched: [{}],
  meta: { auth: true },
};

describe("auth middleware", () => {
  it("aborts without throwing when the page already raised an error", async () => {
    pageError.value = { statusCode: 404 };
    const middleware = await loadMiddleware();

    await expect(middleware(privateRoute)).resolves.toBe(false);
    expect(navigateDms).not.toHaveBeenCalled();
  });

  it("still sends a signed-out visitor to the login page", async () => {
    const middleware = await loadMiddleware();

    await middleware(privateRoute);

    expect(navigateDms).toHaveBeenCalledWith({
      path: "/auth",
      query: { redirect: "/projects/project" },
    });
  });
});
