import { useEventListener } from "@vueuse/core";
import type { Ref } from "vue";
import type { AgendaViewType } from "../../../types/full-agenda";
import type { AgendaOccurrence, ResolvedAgendaView } from "./agendaModel";

/** The attribute marking an agenda's root: a shortcut is the agenda's the focus is in. */
export const AGENDA_ROOT_ATTRIBUTE = "data-dms-agenda";
const ROOT_SELECTOR = `[${AGENDA_ROOT_ATTRIBUTE}]`;
const SAVE_KEY = "s";
const EDITABLE_SELECTOR =
  "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox'], [role='combobox'], [role='listbox'], [role='menu'], [role='dialog']";

/** The views the letters switch to. */
export const AGENDA_VIEW_KEYS: Record<string, AgendaViewType> = {
  m: "month",
  w: "week",
  d: "day",
  l: "list",
  y: "year",
};

/** What the shortcuts act on. */
export interface AgendaShortcutTargets {
  root: Ref<HTMLElement | null>;
  enabled: () => boolean;
  isStaged: () => boolean;
  views: () => ResolvedAgendaView[];
  occurrences: () => AgendaOccurrence[];
  focusedKey: Ref<string | null>;
  goToday: () => void;
  go: (step: 1 | -1) => void;
  setView: (id: string) => void;
  createNew: () => void;
  open: (occurrence: AgendaOccurrence) => void;
  remove: (occurrence: AgendaOccurrence) => void;
  saveStaged: () => void;
  hasStaged: () => boolean;
  /** Esc: a `twoClicks` range started, a drag running. */
  cancel: () => void;
}

/**
 * Whether a key press is this agenda's: the focus is inside it, or on the
 * page itself (no field, no other agenda) and it is the page's only agenda.
 */
export function ownsAgendaKey(
  root: Element | null | undefined,
  target: EventTarget | null,
): boolean {
  if (typeof document === "undefined" || !root) return false;
  const element = target instanceof Element ? target : null;
  if (element?.closest(EDITABLE_SELECTOR)) return false;
  const active = document.activeElement;
  const owner = active?.closest(ROOT_SELECTOR);
  if (owner) return owner === root;
  if (active && active !== document.body) return false;
  return document.querySelectorAll(ROOT_SELECTOR).length === 1;
}

/** The key of the occurrence next to the focused one (the first or last with none focused). */
export function nextFocusedKey(
  occurrences: AgendaOccurrence[],
  focused: string | null,
  step: 1 | -1,
): string | null {
  if (!occurrences.length) return null;
  const index = occurrences.findIndex((entry) => entry.key === focused);
  if (index === -1)
    return occurrences[step === 1 ? 0 : occurrences.length - 1]!.key;
  const next = Math.min(Math.max(index + step, 0), occurrences.length - 1);
  return occurrences[next]!.key;
}

type KeyAction = (
  event: KeyboardEvent,
  targets: AgendaShortcutTargets,
) => boolean;

const focused = (targets: AgendaShortcutTargets) =>
  targets.occurrences().find((entry) => entry.key === targets.focusedKey.value);

/** Arrows step the period, or the focus among events once one has it; Alt + arrows are the drag's. */
const arrow =
  (step: 1 | -1): KeyAction =>
  (_event, targets) => {
    if (targets.focusedKey.value === null) {
      targets.go(step);
      return true;
    }
    targets.focusedKey.value = nextFocusedKey(
      targets.occurrences(),
      targets.focusedKey.value,
      step,
    );
    return true;
  };

const KEY_ACTIONS: Record<string, KeyAction> = {
  t: (_event, targets) => {
    targets.goToday();
    return true;
  },
  n: (_event, targets) => {
    targets.createNew();
    return true;
  },
  arrowleft: arrow(-1),
  arrowright: arrow(1),
  enter: (_event, targets) => {
    const occurrence = focused(targets);
    if (!occurrence) return false;
    targets.open(occurrence);
    return true;
  },
  delete: (_event, targets) => removeFocused(targets),
  backspace: (_event, targets) => removeFocused(targets),
  escape: (_event, targets) => {
    targets.cancel();
    return false;
  },
};

function removeFocused(targets: AgendaShortcutTargets): boolean {
  const occurrence = focused(targets);
  if (!occurrence?.canDelete) return false;
  targets.remove(occurrence);
  return true;
}

function switchView(key: string, targets: AgendaShortcutTargets): boolean {
  const type = AGENDA_VIEW_KEYS[key];
  const view = type && targets.views().find((entry) => entry.type === type);
  if (!view) return false;
  targets.setView(view.id);
  return true;
}

/** Ctrl / ⌘ S saves the staged changes; nothing staged leaves the browser's own. */
function saveShortcut(
  event: KeyboardEvent,
  targets: AgendaShortcutTargets,
): boolean {
  if (event.key.toLowerCase() !== SAVE_KEY) return false;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;
  if (!targets.isStaged() || !targets.hasStaged()) return false;
  const root = targets.root.value;
  const active = document.activeElement;
  if (!root || !active || !root.contains(active)) return false;
  targets.saveStaged();
  return true;
}

/**
 * The agenda's keyboard: T today, ← → the period (or the focus among events
 * once one has it), M W D L Y the views, N a new event, Enter opens the
 * focused event, Delete removes it, Esc lets go of a range being picked,
 * Ctrl+S saves the staged changes while the focus is inside the agenda.
 */
export function useAgendaShortcuts(targets: AgendaShortcutTargets): void {
  useEventListener(
    typeof window === "undefined" ? undefined : window,
    "keydown",
    (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (saveShortcut(event, targets)) {
        event.preventDefault();
        return;
      }
      if (!targets.enabled() || event.ctrlKey || event.metaKey || event.altKey)
        return;
      if (!ownsAgendaKey(targets.root.value, event.target)) return;
      const key = event.key.toLowerCase();
      const action = KEY_ACTIONS[key];
      const isHandled = action
        ? action(event, targets)
        : !event.shiftKey && switchView(key, targets);
      if (isHandled) event.preventDefault();
    },
  );
}
