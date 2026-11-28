// @vitest-environment jsdom
import { createApp, nextTick, ref, type Ref } from "vue";
import { router as inertiaRouter } from "@inertiajs/vue3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sharedDmsState, type StateValue } from "./state-stub";
import { dmsAppContext } from "./fixtures/dmsAppContext";
import { useSiteLayout } from "../layers/dms-core/app/composables/page/useSiteLayout";
import { useTrailingDeduper } from "../layers/dms-core/app/composables/useTrailingDeduper";
import { createTrailingDeduper } from "../layers/dms-core/app/utils/trailingDeduper";

vi.stubGlobal("defineDmsPlugin", <Setup>(setup: Setup) => setup);
const { default: setUpMenuSync } = await import(
  "../layers/dms-layout/app/plugins/dms-menu-sync.client"
);

interface ServerMenu {
  siteLayout: { pages: object; categories: object };
  siteLayoutTree: Array<{ name: string }>;
  quickActions: object;
  modules: object;
  isOwner: boolean;
}

const STATE_KEYS: ReadonlyArray<readonly [keyof ServerMenu, string]> = [
  ["siteLayout", "dms-siteLayout"],
  ["siteLayoutTree", "dms-pageTree"],
  ["quickActions", "dms-quickActions"],
  ["modules", "dms-modules"],
  ["isOwner", "dms-isOwner"],
];

const state = new Map<string, Ref<StateValue>>();
const authFetch = vi.fn();
let sessionId: Ref<string | undefined>;
let server: ServerMenu;
let reload: ReturnType<typeof vi.spyOn>;

function menuOf(...entries: string[]): ServerMenu {
  return {
    siteLayout: { pages: {}, categories: {} },
    siteLayoutTree: entries.map((name) => ({ name })),
    quickActions: {},
    modules: {},
    isOwner: false,
  };
}

/** What a page load or an Inertia reload writes: the server's menu of the moment. */
function loadPage(): void {
  const served = structuredClone(server);
  for (const [field, key] of STATE_KEYS) {
    sharedDmsState(state)(key, () => undefined).value = served[field];
  }
}

async function settle(): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  state.clear();
  sessionId = ref<string | undefined>(undefined);
  const app = {};
  vi.stubGlobal("useDmsApp", () => app);
  vi.stubGlobal("useDmsState", sharedDmsState(state));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useSiteLayout", useSiteLayout);
  vi.stubGlobal("useTrailingDeduper", useTrailingDeduper);
  vi.stubGlobal("createTrailingDeduper", createTrailingDeduper);
  vi.stubGlobal("usePermissions", () => ({
    fetchPermissions: () => Promise.resolve(),
  }));
  const ownSessionId = sessionId;
  vi.stubGlobal("useUserRealtime", () => ({
    sessionId: ownSessionId,
    menuTopics: ref(["menu:tenant:t1"]),
    subscribe: () => () => undefined,
  }));
  authFetch.mockImplementation((url: string) =>
    url === "/dms/sitelayout"
      ? Promise.resolve(structuredClone(server))
      : Promise.reject(new Error(`unexpected ${url}`)),
  );
  vi.spyOn(inertiaRouter, "flushAll").mockImplementation(() => undefined);
  reload = vi.spyOn(inertiaRouter, "reload").mockImplementation(loadPage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

it("lists a menu entry created after the page load and before the realtime stream first opens, whose menu-changed event no session received (catches a first opening that trusts the menu the page brought)", async () => {
  server = menuOf("Overview");
  loadPage();
  await setUpMenuSync(dmsAppContext(createApp({})));

  server = menuOf("Overview", "Project Alpha");
  sessionId.value = "session-1";
  await settle();

  expect(useSiteLayout().siteLayoutTree.value).toEqual(
    menuOf("Overview", "Project Alpha").siteLayoutTree,
  );
});

it("reloads nothing on a first opening when the menu did not change since the page load, and asks for it once (catches a first opening that reloads the page and the menu on every load)", async () => {
  server = menuOf("Overview");
  loadPage();
  await setUpMenuSync(dmsAppContext(createApp({})));

  sessionId.value = "session-1";
  await settle();

  expect(reload).not.toHaveBeenCalled();
  expect(authFetch).toHaveBeenCalledOnce();
  expect(useSiteLayout().siteLayoutTree.value).toEqual(
    menuOf("Overview").siteLayoutTree,
  );
});

it("resyncs on a reopening even when the menu looks unchanged, since its events may have moved more than the menu (catches a reopening that only compares the menu)", async () => {
  server = menuOf("Overview");
  loadPage();
  await setUpMenuSync(dmsAppContext(createApp({})));
  sessionId.value = "session-1";
  await settle();

  sessionId.value = undefined;
  await settle();
  sessionId.value = "session-2";
  await settle();

  expect(reload).toHaveBeenCalled();
});
