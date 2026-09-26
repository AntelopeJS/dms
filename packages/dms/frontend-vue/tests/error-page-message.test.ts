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
import type { DmsErrorData } from "#dms/frontend-module";
import ErrorPage from "../layers/dms-layout/app/error.vue";
import {
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND,
  HTTP_UNAUTHORIZED,
} from "../layers/dms-core/app/utils/http-status";

const TECHNICAL_MESSAGE = "DMS backend request failed";
const SERVER_PLACEHOLDER: DmsErrorData = {
  statusMessage: "Application error",
  message: "An unexpected error occurred",
};

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

function mountError(
  statusCode: number,
  error: DmsErrorData = { message: TECHNICAL_MESSAGE },
) {
  app = createApp(ErrorPage, { error: { statusCode, ...error } });
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

it.each([500, 502, 503])(
  "does not repeat the server's placeholder under the %i description",
  (statusCode) => {
    const text = mountError(statusCode, SERVER_PLACEHOLDER);
    expect(text).toContain("error.500.description");
    expect(text).not.toContain(SERVER_PLACEHOLDER.message);
  },
);
