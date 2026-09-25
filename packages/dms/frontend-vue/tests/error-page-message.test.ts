// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  onMounted,
  ref,
  type App,
} from "vue";
import ErrorPage from "../layers/dms-layout/app/error.vue";
import {
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND,
  HTTP_UNAUTHORIZED,
} from "../layers/dms-core/app/utils/http-status";

const TECHNICAL_MESSAGE = "DMS backend request failed";

let app: App;
let host: HTMLDivElement;

const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

function installRuntime() {
  Object.entries({
    computed,
    ref,
    onMounted,
    HTTP_FORBIDDEN,
    HTTP_NOT_FOUND,
    HTTP_UNAUTHORIZED,
  }).forEach(([key, value]) => vi.stubGlobal(key, value));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsRouter", () => ({ back: vi.fn() }));
  vi.stubGlobal("useHomepage", () => "/");
  vi.stubGlobal("useSessionRecovery", () => ({
    loggedIn: ref(true),
    reconcileSession: vi.fn(),
    redirectToAuth: vi.fn(),
  }));
}

function mountError(statusCode: number) {
  app = createApp(ErrorPage, {
    error: { statusCode, message: TECHNICAL_MESSAGE },
  });
  app.config.globalProperties.$t = (key: string) => key;
  app.component("DmsAppLogo", Passthrough);
  app.component("DmsCard", Passthrough);
  app.component("Icon", Passthrough);
  app.component("UButton", Passthrough);
  app.mount(host);
  return host.textContent ?? "";
}

beforeEach(() => {
  installRuntime();
  host = document.createElement("div");
});
afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it.each([HTTP_NOT_FOUND, HTTP_FORBIDDEN])(
  "keeps the technical cause off the %i card",
  (statusCode) => {
    const text = mountError(statusCode);
    expect(text).toContain(`error.${statusCode}.description`);
    expect(text).not.toContain(TECHNICAL_MESSAGE);
  },
);

it("still shows the message of an unexpected error", () => {
  expect(mountError(500)).toContain(TECHNICAL_MESSAGE);
});
