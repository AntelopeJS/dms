/** @vitest-environment jsdom */
/**
 * The profile's personal information through the runtime's real async data:
 * a server render reads the profile and the picture's URL and renders the
 * name, the address with its verification and the picture; the browser
 * hydrates with them without asking again, and the form edits a copy.
 */
import {
  computed,
  defineComponent,
  h,
  inject,
  nextTick,
  onScopeDispose,
  ref,
  shallowReactive,
  Suspense,
  watch,
  type App,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hydrate, serverRender, stubApiData } from "./helpers/api-data-runtime";
import { useFileReadUrls } from "../layers/dms-ui/app/composables/useFileReadUrls";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";

const ENDPOINT = "/settings/user/profile";
const PROFILE = {
  name: "Bea Owner",
  email: "bea@example.test",
  avatar: { key: "avatars/bea.png" },
  isValidated: true,
};

const authFetch = vi.fn(async (url: string) =>
  url === ENDPOINT
    ? structuredClone(PROFILE)
    : { url: "https://files.test/bea.png", filename: "bea.png" },
);
const mounted: App[] = [];

const Input = defineComponent({
  props: { modelValue: String, id: String },
  setup: (props) => () => h("input", { id: props.id, value: props.modelValue }),
});
const Avatar = defineComponent({
  props: { src: String, alt: String },
  setup: (props) => () => h("img", { src: props.src ?? "", alt: props.alt }),
});
const Badge = defineComponent({
  props: { label: String },
  setup: (props) => () => h("span", props.label),
});
const Slots = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", [slots.label?.(), slots.default?.()]),
});

function register(app: App): void {
  for (const name of ["DmsCard", "DmsFieldRow", "DmsLink", "DmsSaveBar"])
    app.component(name, Slots);
  for (const name of ["UButton", "UIcon", "USkeleton", "DmsFieldError"])
    app.component(name, () => null);
  app.component("UInput", Input);
  app.component("UAvatar", Avatar);
  app.component("UBadge", Badge);
}

beforeEach(async () => {
  installAuthSettingsRuntime();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("inject", inject);
  vi.stubGlobal("onScopeDispose", onScopeDispose);
  vi.stubGlobal("shallowReactive", shallowReactive);
  vi.stubGlobal("useTemplateRef", () => ref(null));
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "x-content-language");
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useTranslation", () => ({
    processApiMessage: (key: string) => key,
  }));
  vi.stubGlobal("useCurrentUser", () => ({
    user: ref({ name: "Session name", email: "bea@example.test" }),
    refresh: async () => {},
  }));
  vi.stubGlobal("useProfileAvatar", () => ({ upload: vi.fn() }));
  vi.stubGlobal("useUploadWithProgress", () => ({}));
  vi.stubGlobal("useFileReadUrls", useFileReadUrls);
  stubApiData(authFetch);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  authFetch.mockClear();
});

it("renders the saved profile and its picture on the server, and the browser does not read them again", async () => {
  const { default: ProfilePersonalInfo } = await import(
    "../layers/dms-layout/app/build/components/pages/settings/profile/ProfilePersonalInfo.vue"
  );

  const Page = defineComponent({
    setup: () => () =>
      h(Suspense, null, {
        default: () => h(ProfilePersonalInfo, { endpoint: ENDPOINT }),
      }),
  });

  vi.stubEnv("SSR", true);
  const { html, payload } = await serverRender(Page, register);
  vi.stubEnv("SSR", false);
  expect(html).toContain('value="Bea Owner"');
  expect(html).toContain('src="https://files.test/bea.png"');
  expect(html).toContain("page.settings.security.verified");
  expect(authFetch.mock.calls.map(([url]) => url)).toEqual([
    ENDPOINT,
    "/api/files/metadata",
  ]);

  authFetch.mockClear();
  const { app, container } = hydrate(Page, html, payload, register);
  mounted.push(app);
  await nextTick();
  await new Promise((done) => setTimeout(done, 0));
  expect(authFetch).not.toHaveBeenCalled();
  expect(
    container.querySelector<HTMLInputElement>("#profile-name")?.value,
  ).toBe("Bea Owner");
});
