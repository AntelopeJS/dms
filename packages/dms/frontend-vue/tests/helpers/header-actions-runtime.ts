import {
  computed,
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
  type App,
  type Component,
  type FunctionalComponent,
  type Ref,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, vi } from "vitest";
import type { useDmsCookie } from "#dms/frontend-module";
import DashboardHeader from "../../layers/dms-layout/app/entries/components/layout/DashboardHeader";
import {
  BUILDER_ACTION_ID,
  type HeaderAction,
  useHeaderActions,
} from "../../layers/dms-layout/app/composables/useHeaderActions";
import { FormEvents } from "../../layers/dms-ui/app/composables/form/types/events";
import { stubDmsState } from "./dms-state-stub";

export const ACTIVE_COLOR = "primary";
export const IDLE_COLOR = "neutral";
export const PANEL_ID = "demo:panel";

const sharedState = new Map<string, Ref<unknown>>();
let app: App | undefined;

/** The components `resolveDmsComponent` finds by name. */
export const registeredComponents = new Map<string, Component>();

function cookie(
  name: string,
  options: Parameters<typeof useDmsCookie>[1] = {},
): Ref<unknown> {
  const key = `cookie:${name}`;
  const stored = sharedState.get(key) ?? ref(options.default?.() ?? null);
  sharedState.set(key, stored);
  return stored;
}

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { color: String, icon: String, onClick: Function },
  setup:
    (props, { attrs, slots }) =>
    () =>
      h(
        "button",
        {
          "aria-label": attrs["aria-label"],
          "aria-pressed": attrs["aria-pressed"],
          "data-color": props.color,
          onClick: () => {
            props.onClick?.();
          },
        },
        slots.leading?.() ?? [h("i", { "data-icon": props.icon })],
      ),
});

const IconStub = defineComponent({
  inheritAttrs: false,
  props: { name: String },
  setup:
    (props, { attrs }) =>
    () =>
      h("i", { "data-icon": props.name, class: attrs.class }),
});

export const AnimatedIcon: FunctionalComponent = () =>
  h("svg", { "data-animated-icon": "" });

const SlotsStub = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", [slots.leading?.(), slots.right?.(), slots.default?.()]),
});

function installRuntime(): void {
  const runtime = {
    computed,
    FormEvents,
    ref,
    watch,
    onMounted,
    onUnmounted,
    useDmsUserSession: () => ({ loggedIn: ref(false) }),
    useQuickActions: () => ({ categoryGroups: ref([]) }),
    useNotifications: () => ({
      unreadCount: ref(0),
      unreadTone: ref(undefined),
      areCountsLoaded: ref(true),
      notifications: ref([]),
      hasMore: ref(false),
      fetchBellCounts: async () => {},
      fetchNotifications: async () => {},
      markAsRead: async () => {},
    }),
    useInfiniteScroll: () => ({
      isLoadingMore: ref(false),
      setupObserver: () => {},
      disconnectObserver: () => {},
    }),
    BUILDER_ACTION_ID,
    buildBreadcrumbTarget: () => null,
    buildFavoritePage: () => null,
    useDmsAppConfig: () => ({ ui: { icons: {} } }),
    useDmsCookie: cookie,
    useDmsRoute: () => reactive({ path: "/", query: {} }),
    useFavoritePages: () => ({ isFavorite: () => false }),
    useHeaderActions,
    resolveDmsComponent: (name?: string) =>
      name === undefined ? undefined : registeredComponents.get(name),
    useHomepage: () => "/",
    useI18n: () => ({ t: (key: string) => key }),
    useSiteLayout: () => ({ findMatchingRoute: () => null }),
    useTranslation: () => ({
      processI18n: (value: string) => value.replace(/^\$/, "t:"),
    }),
  };
  Object.entries(runtime).forEach(([name, value]) =>
    vi.stubGlobal(name, value),
  );
  stubDmsState(sharedState);
}

/** Gives each test a fresh runtime under the header, and unmounts its header after it. */
export function useHeaderActionsRuntime(): void {
  beforeEach(() => {
    sharedState.clear();
    registeredComponents.clear();
    registeredComponents.set("StateIcon", AnimatedIcon);
    installRuntime();
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });
}

function createHeaderApp(create: typeof createApp): App {
  const header = create(DashboardHeader);
  header.config.globalProperties.$t = String;
  header.component("UButton", ButtonStub);
  header.component("UIcon", IconStub);
  ["UDashboardNavbar", "UTooltip", "UBreadcrumb", "UDropdownMenu"].forEach(
    (name) => header.component(name, SlotsStub),
  );
  return header;
}

export async function mountHeader(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  app = createHeaderApp(createApp);
  app.mount(host);
  await nextTick();
  return host;
}

/**
 * Renders the header on the "server", runs what only the client runs (a
 * `.client` plugin), then hydrates the server markup.
 */
export async function hydrateHeader(
  runOnClient: () => void,
): Promise<{ host: HTMLElement; serverHtml: string }> {
  const host = document.createElement("div");
  const serverHtml = await renderToString(createHeaderApp(createSSRApp));
  host.innerHTML = serverHtml;
  document.body.append(host);
  runOnClient();
  app = createHeaderApp(createSSRApp);
  app.mount(host);
  return { host, serverHtml };
}

export function hydrationWarnings(
  spies: Array<{ mock: { calls: unknown[][] } }>,
): string[] {
  return spies
    .flatMap((spy) => spy.mock.calls.map((call) => String(call[0])))
    .filter((message) => message.includes("Hydration"));
}

export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function button(
  host: HTMLElement,
  label: string,
): HTMLButtonElement | null {
  return host.querySelector(`button[aria-label="${label}"]`);
}

export function action(
  id: string,
  extra: Partial<HeaderAction> = {},
): HeaderAction {
  return { id, icon: "i-ph-star", label: id, ...extra };
}
