import { useEventListener } from "@vueuse/core";
import type { Ref } from "vue";
import type { AgendaViewType } from "../../../types/full-agenda";
import type { AgendaOccurrence, ResolvedAgendaView } from "./agendaModel";

/** The attribute marking an agenda's root: a shortcut is the agenda's the focus is in. */
export const AGENDA_ROOT_ATTRIBUTE = "data-dms-agenda";
const ROOT_SELECTOR = `[${AGENDA_ROOT_ATTRIBUTE}]`;
const SAVE_KEY = "s";
/** Where keys are the widget's own: fields, menus, dialogs, radio groups, tabs, grid cells. */
const EDITABLE_SELECTOR =
  "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox'], [role='combobox'], [role='listbox'], [role='menu'], [role='dialog'], [role='radiogroup'], [role='radio'], [role='tablist'], [role='tab'], [role='gridcell'], [role='slider'], [role='spinbutton']";

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

/** What a key acts on: the targets, and the chip the focus is on. */
interface KeyContext {
  targets: AgendaShortcutTargets;
  /** The key of the event chip holding the DOM focus, `null` when none does. */
  chip: string | null;
}

type KeyAction = (context: KeyContext) => boolean;

/** The chips carry their occurrence key (`data-agenda-occurrence`). */
const CHIP_ATTRIBUTE = "data-agenda-occurrence";

/** The occurrence key of the chip `target` sits in, inside the agenda. */
export function chipKeyOf(
  root: Element | null | undefined,
  target: EventTarget | null,
): string | null {
  if (!root || !(target instanceof Element)) return null;
  const chip = target.closest(`[${CHIP_ATTRIBUTE}]`);
  if (!chip || !root.contains(chip)) return null;
  return chip.getAttribute(CHIP_ATTRIBUTE);
}

/** Moves the DOM focus to the chip of `key`, if it is drawn. */
function focusChip(root: HTMLElement | null, key: string | null): void {
  if (!root || key === null) return;
  const chips = root.querySelectorAll<HTMLElement>(`[${CHIP_ATTRIBUTE}]`);
  const chip = [...chips].find(
    (element) => element.getAttribute(CHIP_ATTRIBUTE) === key,
  );
  chip?.focus();
}

const chipOccurrence = ({ targets, chip }: KeyContext) =>
  chip === null
    ? undefined
    : targets.occurrences().find((entry) => entry.key === chip);

/**
 * ← → step the period; on a focused chip they move the focus to the event
 * before or after it (Alt + arrows are the drag's).
 */
const arrow =
  (step: 1 | -1): KeyAction =>
  ({ targets, chip }) => {
    if (chip === null) {
      targets.go(step);
      return true;
    }
    const next = nextFocusedKey(targets.occurrences(), chip, step);
    targets.focusedKey.value = next;
    focusChip(targets.root.value, next);
    return true;
  };

const KEY_ACTIONS: Record<string, KeyAction> = {
  t: ({ targets }) => {
    targets.goToday();
    return true;
  },
  n: ({ targets }) => {
    targets.createNew();
    return true;
  },
  arrowleft: arrow(-1),
  arrowright: arrow(1),
  enter: (context) => {
    const occurrence = chipOccurrence(context);
    if (!occurrence) return false;
    context.targets.open(occurrence);
    return true;
  },
  delete: (context) => removeFocused(context),
  backspace: (context) => removeFocused(context),
  escape: ({ targets }) => {
    targets.cancel();
    return false;
  },
};

function removeFocused(context: KeyContext): boolean {
  const occurrence = chipOccurrence(context);
  if (!occurrence?.canDelete) return false;
  context.targets.remove(occurrence);
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
      const chip = chipKeyOf(targets.root.value, event.target);
      // The focus is the truth: a chip left by the focus is no longer focused.
      if (targets.focusedKey.value !== chip) targets.focusedKey.value = chip;
      if (chip === null && !ownsAgendaKey(targets.root.value, event.target))
        return;
      const key = event.key.toLowerCase();
      const action = KEY_ACTIONS[key];
      const isHandled = action
        ? action({ targets, chip })
        : !event.shiftKey && switchView(key, targets);
      if (isHandled) event.preventDefault();
    },
  );
}
