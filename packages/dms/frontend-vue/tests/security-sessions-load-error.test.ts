// @vitest-environment jsdom
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
} from "vue";

const overview = ref({ activeSessions: 1 });
const authFetch = vi.fn();

vi.mock(
  "../layers/dms-layout/app/build/composables/settings/security/useSecurityOverview",
  () => ({
    SECURITY_ENDPOINT: "/settings/user/security",
    useSecurityOverview: () => ({ overview, refresh: async () => {} }),
  }),
);
vi.mock(
  "../layers/dms-layout/app/build/composables/settings/security/useSecurityFormat",
  () => ({
    useSecurityFormat: () => ({
      formatDate: () => "",
      formatRelative: () => "",
      errorMessage: (_error: unknown, fallback: string) => fallback,
    }),
  }),
);
vi.mock(
  "../layers/dms-layout/app/build/composables/security/useSessionHandoff",
  () => ({ useSessionHandoff: () => async () => {} }),
);

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
    actions: { type: Array, default: () => [] },
  },
  setup: (props) => () =>
    h("div", { "data-variant": props.variant ?? "no-data" }, [
      props.title,
      ...(props.actions as { label: string; onClick: () => void }[]).map(
        (action) =>
          h(
            "button",
            { type: "button", onClick: action.onClick },
            action.label,
          ),
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
    "../layers/dms-layout/app/build/components/pages/settings/security/SecuritySessions.vue"
  );
  app = createApp(SecuritySessions);
  app.component("DmsSection", Passthrough);
  app.component("DmsEmptyState", EmptyState);
  for (const name of ["USkeleton", "UButton", "DmsListRow", "UModal"]) {
    app.component(name, defineComponent({ render: () => h("span") }));
  }
  app.mount(host);
  await flush();
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
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
  authFetch.mockRejectedValueOnce(new Error("network"));
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
