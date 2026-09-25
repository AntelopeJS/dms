import { afterEach, describe, expect, it, vi } from "vitest";
import { useUserLanguage } from "../layers/dms-layout/app/composables/profile/useUserLanguage";

interface LanguageHarness {
  setLocale: ReturnType<typeof vi.fn>;
  authFetch: ReturnType<typeof vi.fn>;
  refreshUser: ReturnType<typeof vi.fn>;
}

function stubComposables(authFetch = vi.fn(async () => ({}))): LanguageHarness {
  const harness: LanguageHarness = {
    setLocale: vi.fn(async () => {}),
    authFetch,
    refreshUser: vi.fn(async () => {}),
  };
  vi.stubGlobal("useDmsApp", () => ({
    $i18n: { setLocale: harness.setLocale },
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: harness.authFetch }));
  vi.stubGlobal("useUserSession", () => ({
    user: { value: { name: "Ada", email: "ada@example.com", language: "en" } },
    fetch: harness.refreshUser,
  }));
  return harness;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useUserLanguage", () => {
  it("applies the language and stores it on the user's profile", async () => {
    const harness = stubComposables();

    await useUserLanguage().changeLanguage("fr");

    expect(harness.setLocale).toHaveBeenCalledWith("fr");
    expect(harness.authFetch).toHaveBeenCalledWith("/settings/user/profile", {
      method: "POST",
      body: { name: "Ada", email: "ada@example.com", language: "fr" },
    });
    expect(harness.refreshUser).toHaveBeenCalled();
  });

  it("keeps the applied language when the profile update fails", async () => {
    const harness = stubComposables(
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    await expect(useUserLanguage().changeLanguage("fr")).resolves.toBe(
      undefined,
    );
    expect(harness.setLocale).toHaveBeenCalledWith("fr");
    expect(harness.refreshUser).not.toHaveBeenCalled();
  });
});
