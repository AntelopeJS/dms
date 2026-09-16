import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePostLoginRedirect } from "../layers/dms-auth/app/composables/usePostLoginRedirect";

const refreshUser = vi.fn();
const refreshLayout = vi.fn();
const addCurrentAccount = vi.fn();
const setLocale = vi.fn();
const navigateTo = vi.fn();

beforeEach(() => {
  vi.stubGlobal("useDmsApp", () => ({ $i18n: { setLocale } }));
  vi.stubGlobal("useUserSession", () => ({
    fetch: refreshUser,
    user: { value: { language: "fr" } },
  }));
  vi.stubGlobal("useMultiAccount", () => ({ addCurrentAccount }));
  vi.stubGlobal("useSiteLayout", () => ({ refresh: refreshLayout }));
  vi.stubGlobal("useHomepage", () => "/");
  vi.stubGlobal("navigateDms", navigateTo);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("post-login redirect", () => {
  it("resolves the onboarding destination only after session and permissions refresh", async () => {
    const resolveDestination = vi.fn(() => {
      expect(refreshUser).toHaveBeenCalledOnce();
      expect(addCurrentAccount).toHaveBeenCalledOnce();
      expect(refreshLayout).toHaveBeenCalledOnce();
      expect(setLocale).toHaveBeenCalledWith("fr");
      return "/dashboard";
    });

    await usePostLoginRedirect(resolveDestination);

    expect(resolveDestination).toHaveBeenCalledOnce();
    expect(navigateTo).toHaveBeenCalledWith("/dashboard");
    expect(refreshUser.mock.invocationCallOrder[0]).toBeLessThan(
      refreshLayout.mock.invocationCallOrder[0]!,
    );
  });

  it("preserves explicit login destinations", async () => {
    await usePostLoginRedirect("/reports");
    expect(navigateTo).toHaveBeenCalledWith("/reports");
  });

  it("falls back to the homepage when no page is accessible", async () => {
    await usePostLoginRedirect(() => undefined);
    expect(navigateTo).toHaveBeenCalledWith("/");
  });

  it("does not navigate when session refresh fails", async () => {
    refreshUser.mockRejectedValueOnce(new Error("Session failed"));
    await expect(usePostLoginRedirect()).rejects.toThrow("Session failed");
    expect(refreshLayout).not.toHaveBeenCalled();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("rejects a session refresh that resolves without an authenticated user", async () => {
    vi.stubGlobal("useUserSession", () => ({
      fetch: refreshUser,
      user: { value: null },
    }));
    const resolveDestination = vi.fn();
    await expect(usePostLoginRedirect(resolveDestination)).rejects.toThrow(
      "Unable to load the authenticated session",
    );
    expect(addCurrentAccount).not.toHaveBeenCalled();
    expect(refreshLayout).not.toHaveBeenCalled();
    expect(resolveDestination).not.toHaveBeenCalled();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("propagates layout failures without resolving or opening the destination", async () => {
    refreshLayout.mockRejectedValueOnce(new Error("Layout failed"));
    const resolveDestination = vi.fn();
    await expect(usePostLoginRedirect(resolveDestination)).rejects.toThrow(
      "Layout failed",
    );
    expect(resolveDestination).not.toHaveBeenCalled();
    expect(navigateTo).not.toHaveBeenCalled();
  });
});
