/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  ref,
  watch,
  type App,
  type PropType,
} from "vue";
import { browserRuntime, stubApiData } from "./helpers/api-data-runtime";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";

const authFetch = vi.fn();

const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", [slots.badge?.(), slots.default?.()]),
});

const EmptyState = defineComponent({
  props: {
    title: String,
    variant: String,
    // SAFETY: SecuritySessions supplies action labels and click handlers to its empty state.
    actions: {
      type: Array as PropType<{ label: string; onClick: () => void }[]>,
      default: () => [],
    },
  },
  setup: (props) => () =>
    h("div", { "data-variant": props.variant ?? "no-data" }, [
      props.title,
      ...props.actions.map((action) =>
        h("button", { type: "button", onClick: action.onClick }, action.label),
      ),
    ]),
});

let app: App;
let host: HTMLDivElement;

async function flush(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await nextTick();
  await new Promise((resolve) => setTimeout(resolve));
}

async function mount(): Promise<void> {
  const { default: SecuritySessions } = await import(
    "../layers/dms-layout/app/entries/components/pages/settings/security/SecuritySessions"
  );
  app = createApp(SecuritySessions);
  browserRuntime(app);
  app.component("DmsSection", Passthrough);
  app.component("DmsEmptyState", EmptyState);
  for (const name of ["USkeleton", "UButton", "DmsListRow", "UModal"]) {
    app.component(name, defineComponent({ render: () => h("span") }));
  }
  app.mount(host);
  await flush();
}

beforeEach(() => {
  installAuthSettingsRuntime();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en"),
    te: () => false,
  }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  stubApiData(authFetch);
  authFetch.mockReset();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("shows a failed load as an error with a retry, not as no sessions", async () => {
  authFetch.mockImplementation(async (url: string) => {
    if (url.endsWith("/sessions")) throw new Error("network");
    return { activeSessions: 1 };
  });
  await mount();
  expect(host.textContent).toContain("dms.table.load_error_title");
  expect(host.textContent).not.toContain("page.settings.sessions.empty");
  expect(host.textContent).not.toContain("sessions_active");
  expect(
    host.querySelector("[data-variant]")?.getAttribute("data-variant"),
  ).toBe("error");

  authFetch.mockResolvedValueOnce([]);
  host.querySelector("button")!.click();
  await flush();
  expect(host.textContent).not.toContain("dms.table.load_error_title");
  expect(host.textContent).toContain("page.settings.sessions.empty");
});
