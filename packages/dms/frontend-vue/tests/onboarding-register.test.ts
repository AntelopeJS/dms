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
const emit = vi.fn();
const showFormError = vi.fn();
const replaceLocation = vi.fn();
const platform = { name: "Acme back office", language: "fr" };
const data = {
  firstName: "Camille",
  lastName: "Laurent",
  email: "admin@example.test",
  password: "test-only",
};

const IMPORT_STATEMENT = /^import[\s\S]*?from\s+"[^"]+";$/gm;

/** The named function of a step's `<script setup>`, run against stubs. */
function loadStepFunction<T>(file: string, name: string): T {
  const component = readFileSync(
    new URL(
      `../layers/dms-onboarding/app/components/onboarding/steps/${file}`,
      import.meta.url,
    ),
    "utf8",
  );
  const script = component
    .split('<script setup lang="ts">')[1]!
    .split("</script>")[0]!;
  const { outputText } = transpileModule(
    script.replace(IMPORT_STATEMENT, ""),
    {},
  );
  return new Function("z", "striptags", `${outputText}; return ${name};`)(
    z,
    striptags,
  );
}

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("reactive", reactive);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("defineProps", () => ({ platform }));
  vi.stubGlobal("defineEmits", () => emit);
  vi.stubGlobal("passwordSchema", z.string());
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: register }));
  vi.stubGlobal("useAuthFormError", () => ({
    formError: ref(null),
    showFormError,
    clearFormError: vi.fn(),
  }));
  vi.stubGlobal("$fetch", login);
  vi.stubGlobal("useUniqueLocales", () => ({ uniqueLocales: ref([]) }));
  vi.stubGlobal("useDmsApp", () => ({
    runWithContext: (fn: () => unknown) => fn(),
  }));
  vi.stubGlobal("useSiteLayout", () => ({ siteLayoutTree: ref(undefined) }));
  vi.stubGlobal("setOnboardingComplete", complete);
  vi.stubGlobal("firstAccessiblePagePath", () => "/dashboard");
  vi.stubGlobal("usePostLoginRedirect", redirect);
  vi.stubGlobal("window", { location: { replace: replaceLocation } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

type Submit = (event: { data: typeof data }) => Promise<void>;
type Open = (destination?: string) => Promise<void>;

it("registers with the platform details, signs in, then moves to the Ready step", async () => {
  await loadStepFunction<Submit>("register.vue", "onSubmit")({ data });

  expect(register).toHaveBeenCalledWith("/api/onboarding/register", {
    method: "POST",
    body: { ...data, platformName: platform.name, language: platform.language },
  });
  expect(complete).toHaveBeenCalledOnce();
  expect(login).toHaveBeenCalledWith("/auth/login", {
    method: "POST",
    body: { email: data.email, password: data.password },
  });
  expect(emit).toHaveBeenCalledExactlyOnceWith("registered", {
    name: "Camille Laurent",
    email: data.email,
  });
  expect(redirect).not.toHaveBeenCalled();
  expect(showFormError).not.toHaveBeenCalled();
});

it("shows the error in the card and stays on the step when registration fails", async () => {
  register.mockRejectedValueOnce(new Error("Registration failed"));
  await loadStepFunction<Submit>("register.vue", "onSubmit")({ data });
  expect(complete).not.toHaveBeenCalled();
  expect(login).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
  expect(showFormError).toHaveBeenCalledOnce();
  expect(replaceLocation).not.toHaveBeenCalled();
});

it("opens login without allowing another registration after automatic login fails", async () => {
  login.mockRejectedValueOnce(new Error("Login failed"));
  const submit = loadStepFunction<Submit>("register.vue", "onSubmit");
  await submit({ data });
  await submit({ data });
  expect(register).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledOnce();
  expect(emit).not.toHaveBeenCalled();
  expect(replaceLocation).toHaveBeenCalledExactlyOnceWith("/auth");
});

it("opens the first accessible page from the Ready step once the session is refreshed", async () => {
  await loadStepFunction<Open>("ready.vue", "open")();

  expect(redirect).toHaveBeenCalledOnce();
  expect(redirect.mock.calls[0]![0]()).toBe("/dashboard");
});

it("opens a next step's page from the Ready step", async () => {
  await loadStepFunction<Open>("ready.vue", "open")("/settings/user/members");

  expect(redirect).toHaveBeenCalledExactlyOnceWith("/settings/user/members");
});

it.each(["Session failed", "Layout failed"])(
  "uses a full reload to recover from %s when leaving the Ready step",
  async (message) => {
    redirect.mockRejectedValueOnce(new Error(message));
    const open = loadStepFunction<Open>("ready.vue", "open");
    await open();
    await open();
    expect(redirect).toHaveBeenCalledOnce();
    expect(replaceLocation).toHaveBeenCalledExactlyOnceWith("/auth");
  },
);
