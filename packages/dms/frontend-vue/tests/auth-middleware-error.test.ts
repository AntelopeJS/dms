/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DmsMiddleware, DmsRoute } from "#dms/frontend-module";

const pageError: { value: { statusCode: number } | null } = { value: null };
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

  it("shows a failed permission load and still lets the signed-in user through", async () => {
    const toast = { add: vi.fn(() => ({ id: "failure" })), remove: vi.fn() };
    vi.stubGlobal("useToast", () => toast);
    vi.stubGlobal("useDmsRuntimeConfig", () => ({ public: { dms: {} } }));
    vi.stubGlobal("useDmsUserSession", () => ({
      loggedIn: { value: true },
      user: { value: { isValidated: true } },
    }));
    vi.stubGlobal("usePermissions", () => ({
      loadPermissions: () => Promise.reject(new Error("unreachable")),
    }));
    const middleware = await loadMiddleware();

    await expect(
      middleware(privateRoute, privateRoute),
    ).resolves.toBeUndefined();

    expect(toast.add).toHaveBeenCalledTimes(1);
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "error.500.description" }),
    );
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
