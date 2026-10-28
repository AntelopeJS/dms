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
  type App,
  type PropType,
} from "vue";
import type DmsEmptyState from "../layers/dms-ui/app/components/empty-state/EmptyState.vue";
import { browserRuntime, stubApiData } from "./helpers/api-data-runtime";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";

const authFetch = vi.fn();

const StatGroup = defineComponent({
  props: { loading: Boolean },
  setup: (props) => () =>
    h("div", { "data-group": props.loading ? "loading" : "ready" }),
});

const EmptyState = defineComponent({
  props: {
    title: String,
    actions: {
      // SAFETY: Vue validates Array at runtime; DmsEmptyState's caller supplies its declared actions prop.
      type: Array as PropType<
        NonNullable<InstanceType<typeof DmsEmptyState>["$props"]["actions"]>
      >,
      default: () => [],
    },
  },
  setup: (props) => () =>
    h("div", [
      props.title,
      ...props.actions.map((action) =>
        h("button", { type: "button", onClick: action.onClick }, action.label),
      ),
    ]),
});

let app: App;
let host: HTMLDivElement;

async function mount(): Promise<void> {
  const { default: SecurityStatus } = await import(
    "../layers/dms-layout/app/entries/components/pages/settings/security/SecurityStatus"
  );
  app = createApp(SecurityStatus);
  browserRuntime(app);
  app.component("DmsStatGroup", StatGroup);
  app.component("DmsEmptyState", EmptyState);
  app.mount(host);
  await nextTick();
}

beforeEach(() => {
  installAuthSettingsRuntime();
  stubApiData(authFetch);
  authFetch.mockReset();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en"),
    te: () => false,
  }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("loads while the security summary is on its way", async () => {
  authFetch.mockReturnValue(new Promise(() => {}));
  await mount();
  expect(host.querySelector("[data-group]")?.getAttribute("data-group")).toBe(
    "loading",
  );
  expect(host.textContent).not.toContain("dms.table.load_error_title");
});

it("says a failed summary failed, with a retry, instead of loading forever", async () => {
  authFetch.mockRejectedValue(new Error("network"));
  await mount();
  await vi.waitFor(() =>
    expect(host.textContent).toContain("dms.table.load_error_title"),
  );
  expect(host.querySelector("[data-group]")).toBeNull();
  expect(host.textContent).toContain("dms.table.load_error_title");

  authFetch.mockClear();
  host.querySelector("button")!.click();
  await vi.waitFor(() =>
    expect(authFetch).toHaveBeenCalledExactlyOnceWith(
      "/dms/pages/settings/user/security",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ),
  );
});
