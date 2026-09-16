import { describe, expect, it, vi } from "vitest";

/**
 * The refresh contract of `useSiteLayout`, extracted so it can be exercised
 * without a DMS app runtime: the composable parks its in-flight fetch on the DMS app
 * app instance, everything else here is the same control flow.
 *
 * What it has to guarantee: a refresh asked for while a fetch is already in
 * flight never reports success on that fetch's answer — it was started before
 * whatever prompted the refresh, so it cannot contain the change.
 */
function createSiteLayoutRefresher(
  fetchLayout: () => Promise<void>,
  // The composable parks the in-flight fetch on the DMS app, so every caller
  // of useSiteLayout coordinates through one holder; passing it in mirrors
  // that, and lets a test act as a second instance.
  holder: { loadingPromise: Promise<void> | null } = { loadingPromise: null },
) {
  const state = holder;

  const start = (): Promise<void> => {
    const started = fetchLayout().finally(() => {
      if (state.loadingPromise === started) {
        state.loadingPromise = null;
      }
    });
    state.loadingPromise = started;
    return started;
  };

  const refresh = async (): Promise<void> => {
    const inFlight = state.loadingPromise;
    if (inFlight) {
      await inFlight.catch(() => undefined);
      if (state.loadingPromise === inFlight) {
        state.loadingPromise = null;
      }
    }
    if (!state.loadingPromise) {
      start();
    }
    await state.loadingPromise;
  };

  return { refresh, start, state };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res();
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useSiteLayout refresh", () => {
  it("refetches instead of joining a fetch that predates the change", async () => {
    const first = deferred();
    const answers = [first.promise, Promise.resolve()];
    const fetchLayout = vi.fn(() => answers.shift() ?? Promise.resolve());
    const { refresh, start } = createSiteLayoutRefresher(fetchLayout);

    start();
    const refreshed = refresh();
    first.resolve();
    await refreshed;

    // The in-flight answer cannot hold the change, so a second one is fetched.
    expect(fetchLayout).toHaveBeenCalledTimes(2);
  });

  it("collapses a burst into a single refetch", async () => {
    const first = deferred();
    const answers = [first.promise, Promise.resolve(), Promise.resolve()];
    const fetchLayout = vi.fn(() => answers.shift() ?? Promise.resolve());
    const { refresh, start } = createSiteLayoutRefresher(fetchLayout);

    start();
    const refreshes = [refresh(), refresh(), refresh()];
    first.resolve();
    await Promise.all(refreshes);

    // Three refreshes over one in-flight fetch: one relaunch, not three.
    expect(fetchLayout).toHaveBeenCalledTimes(2);
  });

  it("refetches after a failed fetch instead of reporting its failure", async () => {
    const first = deferred();
    const answers = [first.promise, Promise.resolve()];
    const fetchLayout = vi.fn(() => answers.shift() ?? Promise.resolve());
    const { refresh, start } = createSiteLayoutRefresher(fetchLayout);

    start().catch(() => undefined);
    const refreshed = refresh();
    first.reject(new Error("network blip"));

    await expect(refreshed).resolves.toBeUndefined();
    expect(fetchLayout).toHaveBeenCalledTimes(2);
  });

  // Two instances of the composable write the same shared layout state, so
  // they have to share the in-flight fetch: otherwise the older answer can
  // land last and overwrite the fresher menu.
  it("shares the in-flight fetch between instances", async () => {
    const first = deferred();
    const answers = [first.promise, Promise.resolve()];
    const fetchLayout = vi.fn(() => answers.shift() ?? Promise.resolve());
    const holder = { loadingPromise: null as Promise<void> | null };
    const instanceA = createSiteLayoutRefresher(fetchLayout, holder);
    const instanceB = createSiteLayoutRefresher(fetchLayout, holder);

    instanceA.start();
    const refreshed = instanceB.refresh();
    first.resolve();
    await refreshed;

    // B saw A's fetch and relaunched once, rather than racing it.
    expect(fetchLayout).toHaveBeenCalledTimes(2);
  });

  it("starts one fetch when nothing is in flight", async () => {
    const fetchLayout = vi.fn(() => Promise.resolve());
    const { refresh } = createSiteLayoutRefresher(fetchLayout);

    await refresh();

    expect(fetchLayout).toHaveBeenCalledTimes(1);
  });
});
