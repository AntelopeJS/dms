import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Middleware = (to: unknown) => Promise<unknown>;

const pageError = { value: null as { statusCode: number } | null };
const navigateDms = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("defineDmsMiddleware", (handler: Middleware) => handler);
  vi.stubGlobal("useError", () => pageError);
  vi.stubGlobal("abortNavigation", () => false);
  vi.stubGlobal("navigateDms", navigateDms);
  vi.stubGlobal("useSiteLayout", () => ({
    siteLayout: { value: {} },
    findMatchingRoute: () => ({ metadata: {} }),
  }));
  vi.stubGlobal("useUserSession", () => ({ loggedIn: { value: false } }));
});

afterEach(() => {
  pageError.value = null;
  navigateDms.mockReset();
  vi.unstubAllGlobals();
});

async function loadMiddleware(): Promise<Middleware> {
  const module = await import("../layers/dms-auth/app/middleware/auth");
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
