// @vitest-environment jsdom
import {
  computed,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  watch,
  onMounted,
  type App,
  type Component,
  type PropType,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Register from "../layers/dms-onboarding/app/components/onboarding/steps/register.vue";
import Onboarding from "../layers/dms-onboarding/app/custom-pages/onboarding.vue";
import {
  passwordSchema,
  usePasswordStrength,
} from "../layers/dms-ui/app/composables/usePasswordStrength";
import type { LocalizedSchema } from "../layers/dms-core/app/composables/useFormValidation";
import { mountInBrowser } from "./helpers/api-data-runtime";

const register = vi.fn();
const login = vi.fn();
const complete = vi.fn();
const redirect = vi.fn();
const registered = vi.fn();
const replaceLocation = vi.fn();
const mounted: App[] = [];
const platform = { name: "Acme back office", language: "fr" };
const data = {
  firstName: "Camille",
  lastName: "Laurent",
  email: "admin@example.test",
  password: "Onboarding42!",
};

function registerUi(app: App) {
  app.config.globalProperties.$t = (key: string) => key;
  app.component(
    "UForm",
    defineComponent({
      props: {
        schema: {
          type: Object as PropType<LocalizedSchema<unknown>>,
          required: true,
        },
        state: { type: Object, required: true },
      },
      emits: ["submit", "error"],
      setup(props, { slots, emit, expose }) {
        expose({
          getErrors: () => [],
          setErrors: () => undefined,
          validate: async () => undefined,
        });
        return () =>
          h(
            "form",
            {
              onSubmit: async (event: Event) => {
                event.preventDefault();
                const result = await props.schema["~standard"].validate(
                  props.state,
                );
                if (result.issues) emit("error", { errors: result.issues });
                else emit("submit", { data: result.value });
              },
            },
            slots.default?.(),
          );
      },
    }),
  );
  app.component(
    "UFormField",
    defineComponent({
      props: ["label", "name"],
      setup:
        (props, { slots }) =>
        () =>
          h("label", [props.label, slots.default?.()]),
    }),
  );
  app.component(
    "UInput",
    defineComponent({
      props: ["modelValue", "size"],
      emits: ["update:modelValue"],
      setup:
        (props, { emit }) =>
        () =>
          h("input", {
            value: props.modelValue,
            onInput: (event: Event) => {
              if (event.target instanceof HTMLInputElement)
                emit("update:modelValue", event.target.value);
            },
          }),
    }),
  );
  app.component(
    "UButton",
    defineComponent({
      props: ["label", "loading"],
      setup: (props) => () => h("button", { type: "button" }, props.label),
    }),
  );
  app.component(
    "UAlert",
    defineComponent({
      props: ["title", "description"],
      setup: (props) => () =>
        h("div", { role: "alert" }, [props.title, props.description]),
    }),
  );
  for (const name of [
    "UIcon",
    "UBadge",
    "DmsIconWell",
    "DmsEyebrow",
    "DmsKeyValueList",
    "i18n-t",
  ]) {
    app.component(name, defineComponent({ setup: () => () => h("span") }));
  }
}

function mountStep(component: Component) {
  const { app, container } = mountInBrowser(
    {
      render: () =>
        h(component, {
          platform,
          onRegistered: registered,
        }),
    },
    registerUi,
  );
  mounted.push(app);
  document.body.append(container);
  return container;
}

async function mountReady() {
  const container = mountStep(Onboarding);
  button(container, "page.onboarding.platform.submit").click();
  await settle();
  await submit(container);
  expect(container.textContent).toContain("page.onboarding.ready.title");
  return container;
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const result = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.includes(label),
  );
  if (!result) throw new Error(`Missing button ${label}`);
  return result;
}

async function submit(container: HTMLElement) {
  for (const [autocomplete, value] of [
    ["given-name", data.firstName],
    ["family-name", data.lastName],
    ["email", data.email],
    ["new-password", data.password],
  ]) {
    const input = container.querySelector(
      `input[autocomplete="${autocomplete}"]`,
    );
    if (!(input instanceof HTMLInputElement))
      throw new Error(`Missing input ${autocomplete}`);
    input.value = value!;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  await nextTick();
  button(container, "page.onboarding.administrator.submit").click();
  await settle();
}

async function settle() {
  for (let tick = 0; tick < 10; tick++) await nextTick();
  await new Promise((done) => setTimeout(done, 0));
}

beforeEach(() => {
  for (const [name, value] of Object.entries({
    ref,
    reactive,
    computed,
    watch,
    onMounted,
    passwordSchema,
    usePasswordStrength,
  })) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("defineDmsPageMeta", () => undefined);
  vi.stubGlobal("useSystemState", () => ({ metaTitle: ref(platform.name) }));
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref(platform.language),
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: register }));
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
  mounted.splice(0).forEach((app) => app.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("registers with the platform details, signs in, then moves to the Ready step", async () => {
  const container = mountStep(Register);
  await submit(container);
  expect(register).toHaveBeenCalledExactlyOnceWith("/api/onboarding/register", {
    method: "POST",
    body: { ...data, platformName: platform.name, language: platform.language },
  });
  expect(complete).toHaveBeenCalledOnce();
  expect(login).toHaveBeenCalledExactlyOnceWith("/auth/login", {
    method: "POST",
    body: { email: data.email, password: data.password },
  });
  expect(registered).toHaveBeenCalledExactlyOnceWith({
    name: "Camille Laurent",
    email: data.email,
  });
  expect(redirect).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("shows the error in the card and stays on the step when registration fails", async () => {
  register.mockRejectedValueOnce(new Error("Registration failed"));
  const container = mountStep(Register);
  await submit(container);
  expect(complete).not.toHaveBeenCalled();
  expect(login).not.toHaveBeenCalled();
  expect(registered).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "page.onboarding.administrator.error_title",
  );
  expect(
    button(container, "page.onboarding.administrator.submit").disabled,
  ).toBe(false);
  expect(replaceLocation).not.toHaveBeenCalled();
});

it("opens login without allowing another registration after automatic login fails", async () => {
  login.mockRejectedValueOnce(new Error("Login failed"));
  const container = mountStep(Register);
  await submit(container);
  expect(
    button(container, "page.onboarding.administrator.submit").disabled,
  ).toBe(true);
  await submit(container);
  expect(register).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledOnce();
  expect(registered).not.toHaveBeenCalled();
  expect(replaceLocation).toHaveBeenCalledExactlyOnceWith("/auth");
});

it("opens the first accessible page from the Ready step once the session is refreshed", async () => {
  const container = await mountReady();
  button(container, "page.onboarding.ready.submit").click();
  await settle();
  expect(redirect).toHaveBeenCalledOnce();
  expect(redirect.mock.calls[0]![0]()).toBe("/dashboard");
});

it("opens a next step's page from the Ready step", async () => {
  const container = await mountReady();
  button(container, "page.onboarding.ready.invite_title").click();
  await settle();
  expect(redirect).toHaveBeenCalledExactlyOnceWith(
    "/settings/workspace/members",
  );
});

it.each(["Session failed", "Layout failed"])(
  "uses a full reload to recover from %s when leaving the Ready step",
  async (message) => {
    redirect.mockRejectedValueOnce(new Error(message));
    const container = await mountReady();
    button(container, "page.onboarding.ready.submit").click();
    await settle();
    button(container, "page.onboarding.ready.submit").click();
    await settle();
    expect(redirect).toHaveBeenCalledOnce();
    expect(replaceLocation).toHaveBeenCalledExactlyOnceWith("/auth");
  },
);
