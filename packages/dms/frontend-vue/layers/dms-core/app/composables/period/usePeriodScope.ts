import { computed, markRaw, ref, type ComputedRef, type Ref } from "vue";
import { resolvesPeriodsAsBrowser } from "./periodTimeZone";
import type { PeriodState } from "./types";

interface PeriodScopeRegistration {
  state: ComputedRef<PeriodState>;
  refCount: number;
}

interface PeriodScopeRegistry {
  scopes: Map<string, PeriodScopeRegistration>;
  version: Ref<number>;
}

const PERIOD_SCOPES_STATE_KEY = "dms-period-scopes";

function createRegistry(): PeriodScopeRegistry {
  return markRaw({ scopes: new Map(), version: ref(0) });
}

// A browser tab runs one application, whose scopes every caller shares; a
// server renders many requests at once, each with its own scopes.
const browserRegistry = createRegistry();

function usePeriodScopeRegistry(): PeriodScopeRegistry {
  if (typeof window !== "undefined") return browserRegistry;
  return useDmsState(PERIOD_SCOPES_STATE_KEY, createRegistry).value;
}

export function registerPeriodScope(
  id: string,
  state: ComputedRef<PeriodState>,
): () => void {
  const registry = usePeriodScopeRegistry();
  const existing = registry.scopes.get(id);
  if (existing) {
    existing.state = state;
    existing.refCount += 1;
  } else {
    registry.scopes.set(id, { state, refCount: 1 });
  }
  registry.version.value += 1;
  return () => {
    const entry = registry.scopes.get(id);
    if (!entry) return;
    entry.refCount -= 1;
    if (entry.refCount <= 0) registry.scopes.delete(id);
    registry.version.value += 1;
  };
}

const warnedMissingScopes = new Set<string>();
const MISSING_SCOPE_WARN_DELAY_MS = 250;

function deferMissingScopeWarn(
  registry: PeriodScopeRegistry,
  id: string,
): void {
  if (warnedMissingScopes.has(id)) return;
  warnedMissingScopes.add(id);
  if (typeof window === "undefined") return;
  setTimeout(() => {
    if (registry.scopes.has(id)) return;
    console.warn(
      `[dms] periodScope "${id}" is not registered. The consumer will run without period filtering. Add a PeriodSelector with id="${id}" to bind it.`,
    );
  }, MISSING_SCOPE_WARN_DELAY_MS);
}

function readPeriodScope(
  registry: PeriodScopeRegistry,
  id: string,
): PeriodState | null {
  void registry.version.value;
  const entry = registry.scopes.get(id);
  if (!entry) {
    deferMissingScopeWarn(registry, id);
    return null;
  }
  return entry.state.value;
}

/**
 * The state of a period scope, `null` while no selector registers it.
 *
 * A server render reads it once, as the caller sets up: a selector that sets
 * up later (further down the page) leaves the caller to the browser, whose
 * first render must match the HTML. It also answers `null` for a period the
 * browser could resolve to other bounds: before the browser's cookie names
 * its time zone. A relative preset resolves from the instant the server
 * hands the browser (`periodRenderNow`), so both read the same bounds.
 */
export function usePeriodScope(
  id: string | undefined,
): ComputedRef<PeriodState | null> {
  if (!id) return computed(() => null);
  const registry = usePeriodScopeRegistry();
  if (typeof window !== "undefined")
    return computed(() => readPeriodScope(registry, id));
  const state = readPeriodScope(registry, id);
  const resolvesAsBrowser = state !== null && resolvesPeriodsAsBrowser();
  return computed(() => (resolvesAsBrowser ? state : null));
}

/**
 * The preset of a period scope, `null` while no selector registers it: what
 * a card's period badge names. A server render reads it once, as the caller
 * sets up, like `usePeriodScope`, but whatever bounds the browser would
 * resolve the period to: a preset is the same name on both sides, so the
 * server prints the badge the browser hydrates.
 */
export function usePeriodScopePreset(
  id: string | undefined,
): ComputedRef<PeriodState["preset"] | null> {
  if (!id) return computed(() => null);
  const registry = usePeriodScopeRegistry();
  if (typeof window !== "undefined")
    return computed(() => readPeriodScope(registry, id)?.preset ?? null);
  const preset = readPeriodScope(registry, id)?.preset ?? null;
  return computed(() => preset);
}

/**
 * `url` with `state` as query parameters: `from` / `to`, `compareFrom` /
 * `compareTo` when a comparison range is set, `preset` and `comparison`.
 * Every period (`all`) has no bounds, so it sends no `from` / `to`.
 */
export function appendPeriodToUrl(
  url: string | undefined,
  state: PeriodState | null,
): string | undefined {
  if (!url || !state) return url;
  const params = new URLSearchParams();
  if (state.range) {
    params.set("from", state.range.from.toISOString());
    params.set("to", state.range.to.toISOString());
  }
  if (state.compareRange) {
    params.set("compareFrom", state.compareRange.from.toISOString());
    params.set("compareTo", state.compareRange.to.toISOString());
  }
  params.set("preset", state.preset);
  params.set("comparison", state.comparison);
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${params.toString()}`;
}
