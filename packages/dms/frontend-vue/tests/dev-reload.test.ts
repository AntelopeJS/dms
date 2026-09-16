import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDevReloadCoordinator,
  type DevReloadDeps,
} from "../layers/dms-layout/app/composables/useDevReload";

/**
 * The dev-reload coordinator is the single mechanism behind both the SSE
 * `reload` handler and the `useDmsDevReload().awaitRoute` module frontends
 * call. These tests drive the real implementation with fake dependencies and a
 * virtual clock: `delay` never waits, it just moves `now` forward, so a
 * timeout is reached in as many iterations as the real one would take.
 */

interface Harness {
  deps: DevReloadDeps;
  /** Routes the backend serves right now. */
  backend: Set<string>;
  /** Routes the committed site layout serves right now. */
  committed: Set<string>;
  probes: number;
  reloadingLog: boolean[];
  commits: number;
  derivedFor: string[];
  clearedFor: string[];
  /** Virtual milliseconds burnt by the coordinator's own waiting. */
  elapsed: () => number;
}

function createHarness(
  overrides: Partial<DevReloadDeps> & {
    /** Probes the backend answers with "route absent" before serving it. */
    probesBeforeServed?: number;
  } = {},
): Harness {
  const { probesBeforeServed = 0, ...depOverrides } = overrides;
  let time = 0;
  const harness: Harness = {
    deps: undefined as unknown as DevReloadDeps,
    backend: new Set<string>(),
    committed: new Set<string>(),
    probes: 0,
    reloadingLog: [],
    commits: 0,
    derivedFor: [],
    clearedFor: [],
    elapsed: () => time,
  };

  harness.deps = {
    isDev: true,
    currentPath: () => "/current",
    isRouteKnown: (path) => harness.committed.has(path),
    probeAndCommitRoute: (path) => {
      harness.probes += 1;
      if (harness.probes <= probesBeforeServed || !harness.backend.has(path)) {
        return Promise.resolve(false);
      }
      harness.committed = new Set(harness.backend);
      return Promise.resolve(true);
    },
    commitLayout: () => {
      harness.commits += 1;
      harness.committed = new Set(harness.backend);
      return Promise.resolve();
    },
    refreshDerived: (path) => {
      harness.derivedFor.push(path);
      return Promise.resolve();
    },
    clearTransient404: (path) => {
      harness.clearedFor.push(path);
    },
    setReloading: (value) => {
      harness.reloadingLog.push(value);
    },
    now: () => time,
    delay: async (ms) => {
      time += ms;
      await Promise.resolve();
    },
    ...depOverrides,
  };

  return harness;
}

describe("dev reload coordinator", () => {
  let harness: Harness;

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("awaitRoute", () => {
    it("answers from the committed layout without probing the backend", async () => {
      harness = createHarness();
      harness.committed.add("/pages/a");
      const coordinator = createDevReloadCoordinator(harness.deps);

      await expect(coordinator.awaitRoute("/pages/a")).resolves.toBe(true);
      // Nothing to wait for: no fetch, and no reload flag raised for a
      // no-op — the reload must stay invisible.
      expect(harness.probes).toBe(0);
      expect(harness.reloadingLog).toEqual([]);
    });

    it("holds until the re-registering backend serves the route", async () => {
      harness = createHarness({ probesBeforeServed: 3 });
      harness.backend.add("/pages/new");
      const coordinator = createDevReloadCoordinator(harness.deps);

      await expect(coordinator.awaitRoute("/pages/new")).resolves.toBe(true);
      expect(harness.probes).toBe(4);
      expect(harness.committed.has("/pages/new")).toBe(true);
      // The layout is committed by the probe itself, so the route the caller
      // asked for is the one that got validated.
      expect(harness.commits).toBe(0);
    });

    it("resolves false when the route never comes back", async () => {
      harness = createHarness();
      const coordinator = createDevReloadCoordinator(harness.deps);

      await expect(coordinator.awaitRoute("/pages/gone")).resolves.toBe(false);
      // Timing out still commits whatever the backend has now, so a genuinely
      // deleted page reaches the renderer and 404s there.
      expect(harness.commits).toBe(1);
      expect(harness.clearedFor).toEqual([]);
    });

    it("honours a caller-supplied timeout", async () => {
      harness = createHarness();
      const coordinator = createDevReloadCoordinator(harness.deps);

      await expect(
        coordinator.awaitRoute("/pages/gone", { timeoutMs: 600 }),
      ).resolves.toBe(false);
      expect(harness.elapsed()).toBeLessThan(1000);
    });

    it("joins an in-flight refresh instead of racing a second fetch loop", async () => {
      harness = createHarness({ probesBeforeServed: 4 });
      harness.backend.add("/current");
      const coordinator = createDevReloadCoordinator(harness.deps);

      const refresh = coordinator.requestRefresh("/current");
      const waited = coordinator.awaitRoute("/current");

      await expect(waited).resolves.toBe(true);
      await refresh;
      // One loop, not two: the probe count is the one the SSE refresh needed.
      expect(harness.probes).toBe(5);
    });

    it("clears the transient 404 once the route is committed", async () => {
      harness = createHarness({ probesBeforeServed: 1 });
      harness.backend.add("/current");
      const coordinator = createDevReloadCoordinator(harness.deps);

      await coordinator.awaitRoute("/current");
      expect(harness.clearedFor).toEqual(["/current"]);
    });
  });

  describe("awaitRoute outside dev", () => {
    it("never probes and only reads the committed layout", async () => {
      harness = createHarness({ isDev: false });
      harness.backend.add("/pages/a");
      const coordinator = createDevReloadCoordinator(harness.deps);

      await expect(coordinator.awaitRoute("/pages/a")).resolves.toBe(false);
      expect(harness.probes).toBe(0);
      expect(harness.commits).toBe(0);
      expect(harness.reloadingLog).toEqual([]);
    });

    it("resolves true when a refresh driven elsewhere commits the route", async () => {
      harness = createHarness({ isDev: false });
      const coordinator = createDevReloadCoordinator(harness.deps);
      let reads = 0;
      harness.deps.isRouteKnown = (path) => {
        reads += 1;
        return reads > 3 && path === "/pages/a";
      };

      await expect(coordinator.awaitRoute("/pages/a")).resolves.toBe(true);
    });

    it("caps the wait well short of the dev timeout", async () => {
      harness = createHarness({ isDev: false });
      const coordinator = createDevReloadCoordinator(harness.deps);

      await expect(
        coordinator.awaitRoute("/pages/a", { timeoutMs: 60000 }),
      ).resolves.toBe(false);
      expect(harness.elapsed()).toBeLessThan(3000);
    });
  });

  describe("requestRefresh", () => {
    it("coalesces a burst into a single trailing re-run on the current route", async () => {
      harness = createHarness();
      harness.backend.add("/pages/a");
      harness.backend.add("/current");
      const coordinator = createDevReloadCoordinator(harness.deps);

      const first = coordinator.requestRefresh("/pages/a");
      const second = coordinator.requestRefresh("/pages/a");
      expect(second).toBe(first);
      coordinator.requestRefresh("/pages/a");

      await coordinator.settled();
      // Two passes for three events, and the trailing one re-reads the route
      // the user is on rather than the stale path captured at burst time.
      expect(harness.derivedFor).toEqual(["/pages/a", "/current"]);
    });

    it("keeps the reload flag raised across the trailing re-run", async () => {
      harness = createHarness();
      harness.backend.add("/current");
      const coordinator = createDevReloadCoordinator(harness.deps);

      const first = coordinator.requestRefresh("/current");
      coordinator.requestRefresh("/current");
      await first;
      await coordinator.settled();

      // Never lowered between the two passes: a flicker there would let the
      // renderer raise the 404 the reload is about to fix.
      expect(harness.reloadingLog).toEqual([true, true, false]);
    });

    it("lowers the reload flag when a pass throws", async () => {
      harness = createHarness({
        commitLayout: () => Promise.reject(new Error("backend down")),
      });
      const coordinator = createDevReloadCoordinator(harness.deps);

      await expect(coordinator.requestRefresh("/pages/a")).resolves.toBe(false);
      expect(harness.reloadingLog).toEqual([true, false]);
    });

    it("settles immediately when nothing is in flight", async () => {
      harness = createHarness();
      const coordinator = createDevReloadCoordinator(harness.deps);

      await expect(coordinator.settled()).resolves.toBeUndefined();
    });
  });
});
