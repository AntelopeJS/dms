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
  type App,
} from "vue";

const overview = ref<unknown>(null);
const isUnavailable = ref(false);
const refresh = vi.fn(async () => {});

vi.mock(
  "../layers/dms-layout/app/build/composables/settings/security/useSecurityOverview",
  () => ({
    useSecurityOverview: () => ({
      overview,
      attention: computed(() => []),
      isUnavailable,
      refresh,
    }),
  }),
);
vi.mock(
  "../layers/dms-layout/app/build/composables/settings/security/useSecurityFormat",
  () => ({
    useSecurityFormat: () => ({ formatDate: () => "", daysSince: () => 0 }),
  }),
);

const StatStrip = defineComponent({
  props: { loading: Boolean },
  setup: (props) => () =>
    h("div", { "data-strip": props.loading ? "loading" : "ready" }),
});

const EmptyState = defineComponent({
  props: { title: String, actions: { type: Array, default: () => [] } },
  setup: (props) => () =>
    h("div", [
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

async function mount(): Promise<void> {
  const { default: SecurityStatus } = await import(
    "../layers/dms-layout/app/build/components/pages/settings/security/SecurityStatus.vue"
  );
  app = createApp(SecurityStatus);
  app.component("DmsStatStrip", StatStrip);
  app.component("DmsEmptyState", EmptyState);
  app.mount(host);
  await nextTick();
}

beforeEach(() => {
  overview.value = null;
  isUnavailable.value = false;
  refresh.mockClear();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("loads while the security summary is on its way", async () => {
  await mount();
  expect(host.querySelector("[data-strip]")?.getAttribute("data-strip")).toBe(
    "loading",
  );
  expect(host.textContent).not.toContain("dms.table.load_error_title");
});

it("says a failed summary failed, with a retry, instead of loading forever", async () => {
  isUnavailable.value = true;
  await mount();
  expect(host.querySelector("[data-strip]")).toBeNull();
  expect(host.textContent).toContain("dms.table.load_error_title");

  refresh.mockClear();
  host.querySelector("button")!.click();
  expect(refresh).toHaveBeenCalledOnce();
});
