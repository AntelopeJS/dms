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
import { readOnlyFailure } from "./helpers/read-only-refusal";
import { useReadOnlyRefusal } from "../layers/dms-core/app/composables/useReadOnlyRefusal";

const authFetch = vi.fn();
const addToast = vi.fn();

const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", [
        slots.badge?.(),
        slots.default?.(),
        slots.trail?.(),
        slots.trailing?.(),
        slots.footer?.(),
      ]),
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
  for (const name of ["USkeleton"]) {
    app.component(name, defineComponent({ render: () => h("span") }));
  }
  for (const name of ["DmsListRow", "UModal"]) app.component(name, Passthrough);
  app.component(
    "UButton",
    defineComponent({
      props: { label: String, loading: Boolean },
      setup: (props) => () =>
        h("button", { disabled: props.loading }, props.label),
    }),
  );
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
  addToast.mockClear();
  vi.stubGlobal("useToast", () => ({ add: addToast }));
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

it.each([true, false])(
  "keeps refused sessions and clears pending state without a duplicate notice, marked %s",
  async (marked) => {
    vi.stubGlobal("useReadOnlyRefusal", useReadOnlyRefusal);
    vi.stubGlobal("getAppTranslation", () => ({
      processApiMessage: (key: string) => key,
    }));
    const sessions = [
      {
        _id: "other",
        browser: "Firefox",
        os: "Linux",
        isCurrent: false,
        createdAt: "2026-10-01",
        lastActiveAt: "2026-10-01",
      },
    ];
    authFetch.mockImplementation(async (url: string) =>
      url.endsWith("/sessions") ? sessions : { activeSessions: 1 },
    );
    await mount();
    const consume = app.runWithContext(useReadOnlyRefusal);
    for (const label of ["sign_out", "confirm_submit"]) {
      addToast.mockClear();
      const failure = marked
        ? readOnlyFailure()
        : { response: new Response(null, { status: 403 }) };
      authFetch.mockImplementationOnce(async () => {
        consume(failure);
        throw failure;
      });
      const button = [...host.querySelectorAll("button")].find(
        (entry) =>
          entry.textContent === `page.settings.security.sessions.${label}`,
      )!;
      button.click();
      await vi.waitFor(() => expect(button.disabled).toBe(false));
      await flush();
      expect(addToast).toHaveBeenCalledOnce();
      expect(addToast.mock.calls[0]?.[0]).toMatchObject(
        marked
          ? { id: "dms-read-only", color: "warning" }
          : {
              color: "error",
              title:
                label === "sign_out"
                  ? "page.settings.sessions.revoke_error"
                  : "page.settings.sessions.revoke_all_error",
            },
      );
      expect(host.textContent).toContain(
        "page.settings.security.sessions.sign_out",
      );
    }
  },
);
