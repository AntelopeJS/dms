import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Middleware = (to: { path: string }) => Promise<unknown>;

const navigateDms = vi.fn();
const onboarding = vi.fn();
const session = { loggedIn: { value: false } };

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("defineDmsMiddleware", (handler: Middleware) => handler);
  vi.stubGlobal("navigateDms", navigateDms);
  vi.stubGlobal("useOnboarding", onboarding);
  vi.stubGlobal("useUserSession", () => session);
  vi.stubGlobal("useHomepage", () => "/dashboard");
});

afterEach(() => {
  session.loggedIn.value = false;
  navigateDms.mockReset();
  onboarding.mockReset();
  vi.unstubAllGlobals();
});

async function loadMiddleware(): Promise<Middleware> {
  const module = await import(
    "../layers/dms-onboarding/app/middleware/onboarding.global"
  );
  return module.default as unknown as Middleware;
}

describe("onboarding middleware", () => {
  it("sends every route to the wizard while no admin exists", async () => {
    onboarding.mockResolvedValue({ hasOnboarded: false });
    const middleware = await loadMiddleware();

    await middleware({ path: "/settings" });

    expect(navigateDms).toHaveBeenCalledWith("/onboarding");
  });

  it("lets the wizard render while no admin exists", async () => {
    onboarding.mockResolvedValue({ hasOnboarded: false });
    const middleware = await loadMiddleware();

    await middleware({ path: "/onboarding" });

    expect(navigateDms).not.toHaveBeenCalled();
  });

  it("sends a signed-in user away from the finished wizard to the homepage", async () => {
    onboarding.mockResolvedValue({ hasOnboarded: true });
    session.loggedIn.value = true;
    const middleware = await loadMiddleware();

    await middleware({ path: "/onboarding" });

    expect(navigateDms).toHaveBeenCalledWith("/dashboard", { replace: true });
  });

  it("sends an anonymous visitor away from the finished wizard to the login page", async () => {
    onboarding.mockResolvedValue({ hasOnboarded: true });
    const middleware = await loadMiddleware();

    await middleware({ path: "/onboarding" });

    expect(navigateDms).toHaveBeenCalledWith("/auth", { replace: true });
  });

  it("leaves other routes alone once onboarding is done", async () => {
    onboarding.mockResolvedValue({ hasOnboarded: true });
    const middleware = await loadMiddleware();

    await middleware({ path: "/settings" });

    expect(navigateDms).not.toHaveBeenCalled();
  });

  it("does not block navigation when the onboarding status is unavailable", async () => {
    onboarding.mockRejectedValue(new Error("offline"));
    const middleware = await loadMiddleware();

    await middleware({ path: "/onboarding" });

    expect(navigateDms).not.toHaveBeenCalled();
  });
});

describe("onboarding page", () => {
  // Global middleware runs on a direct load only for a page declaring its
  // meta: without it, a finished wizard would render instead of redirecting.
  it("declares its meta so the onboarding middleware runs on a direct load", () => {
    const page = readFileSync(
      new URL(
        "../layers/dms-onboarding/app/custom-pages/onboarding.vue",
        import.meta.url,
      ),
      "utf8",
    );
    expect(page).toMatch(/defineDmsPageMeta\(/);
  });
});
