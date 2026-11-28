// @vitest-environment jsdom
import type { Ref } from "vue";
import { router as inertiaRouter } from "@inertiajs/vue3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sharedDmsState, type StateValue } from "./state-stub";
import {
  dispatchFinish,
  dispatchNavigate,
  finishedVisit,
  type InertiaReloadOptions,
  type VisitOutcome,
} from "./fixtures/inertiaVisit";
import { useSiteLayout } from "../layers/dms-core/app/composables/page/useSiteLayout";
import { createTrailingDeduper } from "../layers/dms-core/app/utils/trailingDeduper";

const state = new Map<string, Ref<StateValue>>();
const reloads: InertiaReloadOptions[] = [];
let serverMenu: string[] = [];

const COMPLETED: VisitOutcome = { cancelled: false, interrupted: false };

/** Inertia ends a visit: its global `finish` event, then the visit's own `onFinish`. */
function endVisit(outcome: VisitOutcome, own?: InertiaReloadOptions): void {
  dispatchFinish(outcome);
  own?.onFinish?.(finishedVisit(outcome));
}

/** The server answers reload `index`, when the resync sent it, with its menu. */
function completeReload(index: number): void {
  const reload = reloads[index];
  if (!reload) return;
  sharedDmsState(state)("dms-pageTree", () => undefined).value =
    serverMenu.map((name) => ({ name }));
  endVisit(COMPLETED, reload);
}

/** A navigation to another page starts: Inertia cancels the reload in flight. */
function navigationCancelsReload(index: number): void {
  endVisit({ cancelled: true, interrupted: false }, reloads[index]);
}

function navigationFinishes(): void {
  endVisit(COMPLETED);
}

async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function sidebarOf(...entries: string[]): Array<{ name: string }> {
  return entries.map((name) => ({ name }));
}

beforeEach(() => {
  window.history.replaceState(null, "", "/cloud/projects");
  state.clear();
  reloads.length = 0;
  vi.stubGlobal("useDmsApp", () => ({}));
  vi.stubGlobal("useDmsState", sharedDmsState(state));
  vi.spyOn(inertiaRouter, "flushAll").mockImplementation(() => undefined);
  vi.spyOn(inertiaRouter, "reload").mockImplementation((options) => {
    reloads.push(options ?? {});
  });
  serverMenu = ["Projects"];
  sharedDmsState(state)("dms-pageTree", () => undefined).value =
    sidebarOf("Projects");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("reloads the layout again once a navigation that cancelled the resync's reload has finished (catches a resync that gives up on a cancelled reload, leaving the sidebar stale for minutes)", async () => {
  serverMenu = ["Projects", "Project Alpha"];
  const resync = useSiteLayout().resync();
  navigationCancelsReload(0);
  await settle();
  navigationFinishes();
  await settle();
  completeReload(1);
  await resync;

  expect(useSiteLayout().siteLayoutTree.value).toEqual(
    sidebarOf("Projects", "Project Alpha"),
  );
});

it("keeps retrying through two navigations in a row, each cancelling the reload before it (catches a retry that runs once)", async () => {
  serverMenu = ["Projects", "Project Alpha"];
  const resync = useSiteLayout().resync();
  navigationCancelsReload(0);
  await settle();
  navigationFinishes();
  await settle();
  navigationCancelsReload(1);
  await settle();
  navigationFinishes();
  await settle();
  completeReload(2);
  await resync;

  expect(useSiteLayout().siteLayoutTree.value).toEqual(
    sidebarOf("Projects", "Project Alpha"),
  );
});

it("waits for the navigation to finish before reloading, so the retry does not cancel it in turn (catches a retry sent while the navigation is still in flight)", async () => {
  const resync = useSiteLayout().resync();
  navigationCancelsReload(0);
  await settle();

  expect(reloads).toHaveLength(1);
  navigationFinishes();
  await settle();
  completeReload(1);
  await resync;
});

it("reloads nothing on later navigations once the resync is done (catches a retry that reloads on every navigation)", async () => {
  const resync = useSiteLayout().resync();
  completeReload(0);
  await resync;
  navigationFinishes();
  await settle();

  expect(reloads).toHaveLength(1);
});

it("gives a second menu change that arrives during the retry its own reload, after the first, and ends on the latest menu (catches a menu sync whose retry swallows a later change)", async () => {
  const menuSync = createTrailingDeduper();
  const resync = () => menuSync.run(() => useSiteLayout().resync());
  serverMenu = ["Projects", "Project Alpha"];
  const first = resync();
  navigationCancelsReload(0);
  await settle();
  serverMenu = ["Projects", "Project Alpha", "Project Beta"];
  const second = resync();
  await settle();
  expect(reloads).toHaveLength(1);

  navigationFinishes();
  await settle();
  completeReload(1);
  await first;
  await settle();
  completeReload(2);
  await second;

  expect(reloads).toHaveLength(3);
  expect(useSiteLayout().siteLayoutTree.value).toEqual(
    sidebarOf("Projects", "Project Alpha", "Project Beta"),
  );
});

it("reloads again after a history step that cancelled the reload, which sets the page without a finish event (catches a retry that waits for a finish that never comes)", async () => {
  serverMenu = ["Projects", "Project Alpha"];
  const resync = useSiteLayout().resync();
  navigationCancelsReload(0);
  await settle();
  dispatchNavigate();
  await settle();
  completeReload(1);
  await resync;

  expect(useSiteLayout().siteLayoutTree.value).toEqual(
    sidebarOf("Projects", "Project Alpha"),
  );
});

it("does not reload while the visits that finish are cancelled or interrupted, since the navigation that cancelled it is still in flight (catches a retry woken by any finish)", async () => {
  const resync = useSiteLayout().resync();
  navigationCancelsReload(0);
  await settle();
  dispatchFinish({ cancelled: true, interrupted: false });
  dispatchFinish({ cancelled: false, interrupted: true });
  await settle();

  expect(reloads).toHaveLength(1);
  navigationFinishes();
  await settle();
  completeReload(1);
  await resync;
});

it("reloads again after the settle timeout when nothing follows the cancellation (catches a resync held for good by a cancel no visit follows)", async () => {
  vi.useFakeTimers();
  try {
    const resync = useSiteLayout().resync();
    navigationCancelsReload(0);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(reloads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(reloads).toHaveLength(2);
    completeReload(1);
    await resync;
  } finally {
    vi.useRealTimers();
  }
});

it("reloads again when the page changed while the reload ran, whose answer Inertia then drops (catches a resync that trusts a reload of the page it left)", async () => {
  serverMenu = ["Projects", "Project Alpha"];
  const resync = useSiteLayout().resync();
  window.history.pushState(null, "", "/cloud/projects/project");
  endVisit(COMPLETED, reloads[0]);
  await settle();
  completeReload(1);
  await resync;

  expect(reloads).toHaveLength(2);
  expect(useSiteLayout().siteLayoutTree.value).toEqual(
    sidebarOf("Projects", "Project Alpha"),
  );
});
