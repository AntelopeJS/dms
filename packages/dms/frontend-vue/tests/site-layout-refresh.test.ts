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
  let reject!: (error: Error) => void;
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

  it("shares the in-flight fetch between instances", async () => {
    const first = deferred();
    const answers = [first.promise, Promise.resolve()];
    const fetchLayout = vi.fn(() => answers.shift() ?? Promise.resolve());
    const holder: Parameters<typeof createSiteLayoutRefresher>[1] = {
      loadingPromise: null,
    };
    const instanceA = createSiteLayoutRefresher(fetchLayout, holder);
    const instanceB = createSiteLayoutRefresher(fetchLayout, holder);

    instanceA.start();
    const refreshed = instanceB.refresh();
    first.resolve();
    await refreshed;

    expect(fetchLayout).toHaveBeenCalledTimes(2);
  });

  it("starts one fetch when nothing is in flight", async () => {
    const fetchLayout = vi.fn(() => Promise.resolve());
    const { refresh } = createSiteLayoutRefresher(fetchLayout);

    await refresh();

    expect(fetchLayout).toHaveBeenCalledTimes(1);
  });
});
