import { readFileSync } from "node:fs";
import { transpileModule } from "typescript";
import { computed, reactive, ref } from "vue";
import * as z from "zod";
import striptags from "striptags";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const register = vi.fn();
const login = vi.fn();
const complete = vi.fn();
const redirect = vi.fn();
const addToast = vi.fn();
const apiError = vi.fn();
const replaceLocation = vi.fn();
const data = {
  name: "Admin",
  email: "admin@example.test",
  password: "test-only",
};

function loadSubmit() {
  const component = readFileSync(
    new URL(
      "../layers/dms-onboarding/app/components/onboarding/steps/register.vue",
      import.meta.url,
    ),
    "utf8",
  );
  const script = component
    .split('<script setup lang="ts">')[1]!
    .split("</script>")[0]!;
  const source = script.replace(/^import .*;$/gm, "");
  const { outputText } = transpileModule(source, {});
  return new Function("z", "striptags", `${outputText}; return onSubmit;`)(
    z,
    striptags,
  );
}

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("reactive", reactive);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("passwordSchema", z.string());
  vi.stubGlobal("usePasswordStrength", () => ({}));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: register }));
  vi.stubGlobal("$fetch", login);
  vi.stubGlobal("useToast", () => ({ add: addToast }));
  vi.stubGlobal("useHomepage", () => "/");
  vi.stubGlobal("useDmsApp", () => ({
    runWithContext: (fn: () => unknown) => fn(),
  }));
  vi.stubGlobal("useSiteLayout", () => ({ siteLayoutTree: ref(undefined) }));
  vi.stubGlobal("setOnboardingComplete", complete);
  vi.stubGlobal("firstAccessiblePagePath", () => "/dashboard");
  vi.stubGlobal("usePostLoginRedirect", redirect);
  vi.stubGlobal("useApiError", apiError);
  vi.stubGlobal("window", { location: { replace: replaceLocation } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("registers, logs in, redirects, then shows a single success confirmation", async () => {
  await loadSubmit()({ data });

  expect(register).toHaveBeenCalledWith("/api/onboarding/register", {
    method: "POST",
    body: data,
  });
  expect(complete).toHaveBeenCalledOnce();
  expect(login).toHaveBeenCalledWith("/auth/login", {
    method: "POST",
    body: { email: data.email, password: data.password },
  });
  expect(redirect).toHaveBeenCalledOnce();
  expect(redirect.mock.calls[0]![0]()).toBe("/dashboard");
  expect(addToast).toHaveBeenCalledExactlyOnceWith({
    title: "page.onboarding.success.title",
    color: "success",
  });
  expect(login.mock.invocationCallOrder[0]).toBeLessThan(
    redirect.mock.invocationCallOrder[0]!,
  );
  expect(redirect.mock.invocationCallOrder[0]).toBeLessThan(
    addToast.mock.invocationCallOrder[0]!,
  );
  expect(apiError).not.toHaveBeenCalled();
});

it("does not log in or confirm success when registration fails", async () => {
  register.mockRejectedValueOnce(new Error("Registration failed"));
  await loadSubmit()({ data });
  expect(complete).not.toHaveBeenCalled();
  expect(login).not.toHaveBeenCalled();
  expect(addToast).not.toHaveBeenCalled();
  expect(apiError).toHaveBeenCalledOnce();
  expect(replaceLocation).not.toHaveBeenCalled();
});

it("opens login without allowing another registration after automatic login fails", async () => {
  login.mockRejectedValueOnce(new Error("Login failed"));
  const submit = loadSubmit();
  await submit({ data });
  await submit({ data });
  expect(register).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledOnce();
  expect(redirect).not.toHaveBeenCalled();
  expect(addToast).not.toHaveBeenCalled();
  expect(replaceLocation).toHaveBeenCalledExactlyOnceWith("/auth");
});

it.each(["Session failed", "Layout failed"])(
  "uses a full reload to recover from %s after login",
  async (message) => {
    redirect.mockRejectedValueOnce(new Error(message));
    const submit = loadSubmit();
    await submit({ data });
    await submit({ data });
    expect(register).toHaveBeenCalledOnce();
    expect(login).toHaveBeenCalledOnce();
    expect(replaceLocation).toHaveBeenCalledExactlyOnceWith("/auth");
    expect(addToast).not.toHaveBeenCalled();
  },
);
