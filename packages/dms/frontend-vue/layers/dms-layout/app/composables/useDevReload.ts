import { useDevReloadHolder } from "../build/composables/dev-reload/useDevReloadHolder";

export interface AwaitRouteOptions {
  /** Give up after this many milliseconds. Defaults to 15000. */
  timeoutMs?: number;
}

export interface DevReload {
  /**
   * Whether a dev reload is in flight. Internal state — never render it: the
   * point of this mechanism is that a reload is invisible.
   */
  reloading: Readonly<Ref<boolean>>;
  /** Resolves once no refresh is in flight. */
  settled: () => Promise<void>;
  /**
   * Resolves `true` once the committed site layout serves `path`, `false` on
   * timeout (default 15000 ms).
   */
  awaitRoute: (path: string, options?: AwaitRouteOptions) => Promise<boolean>;
}

/**
 * Wait for the DMS to catch up with a backend change, from a module frontend.
 *
 * Writing a page from the no-code builder or the AI chatbox reloads the backend
 * module, which re-registers its pages one at a time; navigating straight away
 * would land on a route the site layout does not serve yet. `awaitRoute` holds
 * until it does, sharing the core's refresh rather than polling the layout
 * state on its own.
 *
 * ```ts
 * const { awaitRoute } = useDevReload();
 * await createPage(path);
 * await awaitRoute(path);
 * await navigateDms(path);
 * ```
 */
export const useDevReload = (): DevReload => {
  const { coordinator, reloading } = useDevReloadHolder();
  return {
    reloading,
    settled: coordinator.settled,
    awaitRoute: coordinator.awaitRoute,
  };
};
