import { computed, ref, type ComputedRef } from "vue";
import type { PeriodState } from "./types";

interface PeriodScopeRegistration {
  state: ComputedRef<PeriodState>;
  refCount: number;
}

const periodScopeRegistry = new Map<string, PeriodScopeRegistration>();
const registryVersion = ref(0);

function bumpRegistry(): void {
  registryVersion.value += 1;
}

const noopUnregister = (): void => undefined;

export function registerPeriodScope(
  id: string,
  state: ComputedRef<PeriodState>,
): () => void {
  if (typeof window === "undefined") return noopUnregister;
  const existing = periodScopeRegistry.get(id);
  if (existing) {
    existing.state = state;
    existing.refCount += 1;
  } else {
    periodScopeRegistry.set(id, { state, refCount: 1 });
  }
  bumpRegistry();
  return () => {
    const entry = periodScopeRegistry.get(id);
    if (!entry) return;
    entry.refCount -= 1;
    if (entry.refCount <= 0) periodScopeRegistry.delete(id);
    bumpRegistry();
  };
}

const warnedMissingScopes = new Set<string>();
const MISSING_SCOPE_WARN_DELAY_MS = 250;

function deferMissingScopeWarn(id: string): void {
  if (warnedMissingScopes.has(id)) return;
  warnedMissingScopes.add(id);
  if (typeof window === "undefined") return;
  setTimeout(() => {
    if (periodScopeRegistry.has(id)) return;
    console.warn(
      `[dms] periodScope "${id}" is not registered. The consumer will run without period filtering. Add a PeriodSelector with id="${id}" to bind it.`,
    );
  }, MISSING_SCOPE_WARN_DELAY_MS);
}

export function usePeriodScope(
  id: string | undefined,
): ComputedRef<PeriodState | null> {
  return computed(() => {
    if (!id) return null;
    void registryVersion.value;
    const entry = periodScopeRegistry.get(id);
    if (!entry) {
      deferMissingScopeWarn(id);
      return null;
    }
    return entry.state.value;
  });
}

export function appendPeriodToUrl(
  url: string | undefined,
  state: PeriodState | null,
): string | undefined {
  if (!url || !state) return url;
  const params = new URLSearchParams();
  params.set("from", state.range.from.toISOString());
  params.set("to", state.range.to.toISOString());
  if (state.compareRange) {
    params.set("compareFrom", state.compareRange.from.toISOString());
    params.set("compareTo", state.compareRange.to.toISOString());
  }
  params.set("preset", state.preset);
  params.set("comparison", state.comparison);
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${params.toString()}`;
}
