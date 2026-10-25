import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  type ComputedRef,
} from "vue";
import type { AgendaSaveEngine } from "./agendaSaveEngine";

/** How the last write went, as the toolbar tells it. */
export type AgendaSaveStatus = "idle" | "saving" | "saved" | "error";

const SAVED_SHOWN_MS = 2500;
const ERROR_SHOWN_MS = 6000;

/** How long an outcome stays told once nothing is left to resolve. */
const SHOWN_MS: Record<"saved" | "error", number> = {
  saved: SAVED_SHOWN_MS,
  error: ERROR_SHOWN_MS,
};

/**
 * The save status of an agenda: "saving" while a change or an Undo is
 * written; "error" while a refused change or a conflict waits to be
 * resolved; else the last outcome ("saved", or "error" after a refusal
 * that left nothing pending) for a moment, then "idle". A declined
 * `confirm` wrote nothing: back to "idle".
 */
export function useAgendaSaveStatus(engine: () => AgendaSaveEngine) {
  const last = ref<AgendaSaveStatus>("idle");
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (getCurrentScope()) onScopeDispose(() => clearTimeout(timer));

  function settle(outcome: "saved" | "error"): void {
    clearTimeout(timer);
    last.value = outcome;
    timer = setTimeout(() => (last.value = "idle"), SHOWN_MS[outcome]);
  }

  function clear(): void {
    clearTimeout(timer);
    last.value = "idle";
  }

  const status: ComputedRef<AgendaSaveStatus> = computed(() => {
    const current = engine();
    if (current.isSaving.value || current.isWritingNow.value) return "saving";
    const isPending = current.edits.value.some(
      (edit) => edit.status === "error" || edit.status === "conflict",
    );
    return isPending ? "error" : last.value;
  });

  return { status, settle, clear };
}
