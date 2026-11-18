/** How the viewer's shortcuts are grouped in the sheet, in the order the sheet lists them. */
export const MOCKUP_SHORTCUT_GROUPS = [
  "panels",
  "editing",
  "comments",
  "history",
  "overview",
  "preview",
] as const;

export type MockupShortcutGroup = (typeof MOCKUP_SHORTCUT_GROUPS)[number];

/**
 * One key combination. `key` is `KeyboardEvent.key`, lower-cased. A combination
 * needs `command` (Ctrl, or ⌘ on macOS) and `alt` only when it says so, and
 * `shift` only when it says so either way. A `typed` one is a character the
 * layout produces, with whatever modifiers it takes (AltGr on an AZERTY
 * keyboard is Ctrl+Alt): only ⌘ rules it out. A combination with a `code`,
 * `KeyboardEvent.code`, is the key at that place on any layout, which `key`
 * only names: Shift+1 types `!` on a US keyboard and `1` on a French one.
 */
export interface MockupCombo {
  key: string;
  code?: string;
  command?: boolean;
  alt?: boolean;
  shift?: boolean;
  typed?: boolean;
}

/**
 * What the canvas shows: one page of the mockup as it is now, or of a past
 * version of it, read-only; every page of either side by side, in the
 * overview; or a page as the dashboard runs it, in Preview, where a click
 * reaches the page.
 */
export type MockupView =
  | "current"
  | "version"
  | "overview"
  | "overview_version"
  | "preview";

const PAGE_VIEWS: readonly MockupView[] = ["current", "version"];
const OVERVIEW_VIEWS: readonly MockupView[] = ["overview", "overview_version"];
const EVERY_VIEW: readonly MockupView[] = [...PAGE_VIEWS, ...OVERVIEW_VIEWS];

/**
 * A shortcut of the viewer: the combinations that fire it, the first one being
 * the one shown, and the views it fires in, the current mockup's alone when
 * `views` is omitted.
 */
export interface MockupShortcut {
  group: MockupShortcutGroup;
  combos: readonly [MockupCombo, ...MockupCombo[]];
  views?: readonly MockupView[];
}

/**
 * Every shortcut of the viewer, the one table the key handler, the tooltips
 * and the shortcuts sheet read. Each id names a locale text,
 * `dms.mockup.shortcut_<id>`. The table's order is the sheet's, and the order
 * a key tries the shortcuts it fires: Escape steps back from the selection
 * or a comment before it closes the page.
 */
export const MOCKUP_SHORTCUTS = {
  left_panel: {
    group: "panels",
    combos: [{ key: "[", typed: true }],
    views: PAGE_VIEWS,
  },
  right_panel: {
    group: "panels",
    combos: [{ key: "]", typed: true }],
    views: PAGE_VIEWS,
  },
  shortcuts: {
    group: "panels",
    combos: [{ key: "?", typed: true }],
    views: [...EVERY_VIEW, "preview"],
  },
  select_previous: { group: "editing", combos: [{ key: "arrowup" }] },
  select_next: { group: "editing", combos: [{ key: "arrowdown" }] },
  move_up: { group: "editing", combos: [{ key: "arrowup", alt: true }] },
  move_down: { group: "editing", combos: [{ key: "arrowdown", alt: true }] },
  duplicate: { group: "editing", combos: [{ key: "d", command: true }] },
  remove: {
    group: "editing",
    combos: [{ key: "delete" }, { key: "backspace" }],
  },
  insert_placed: { group: "editing", combos: [{ key: "enter" }] },
  cancel: {
    group: "editing",
    combos: [{ key: "escape" }],
    views: ["current", "overview"],
  },
  comment: {
    group: "comments",
    combos: [{ key: "c" }],
    views: ["current", "overview"],
  },
  undo: {
    group: "history",
    combos: [{ key: "z", command: true, shift: false }],
  },
  redo: {
    group: "history",
    combos: [
      { key: "z", command: true, shift: true },
      { key: "y", command: true },
    ],
  },
  back_to_current: {
    group: "history",
    combos: [{ key: "escape" }],
    views: ["version", "overview_version"],
  },
  close_page: {
    group: "overview",
    combos: [{ key: "escape" }],
  },
  fit_all: {
    group: "overview",
    combos: [{ key: "1", code: "Digit1", shift: true }],
    views: OVERVIEW_VIEWS,
  },
  preview: {
    group: "preview",
    combos: [{ key: "p" }],
    views: [...PAGE_VIEWS, "preview"],
  },
  close_preview: {
    group: "preview",
    combos: [{ key: "escape" }],
    views: ["preview"],
  },
} as const satisfies Record<string, MockupShortcut>;

export type MockupShortcutId = keyof typeof MOCKUP_SHORTCUTS;

const KEY_NAMES: ReadonlyMap<string, string> = new Map([
  ["arrowup", "↑"],
  ["arrowdown", "↓"],
  ["escape", "Esc"],
  ["delete", "Delete"],
  ["backspace", "Backspace"],
  ["enter", "Enter"],
]);

function matches(combo: MockupCombo, event: KeyboardEvent): boolean {
  const isKey = combo.code
    ? event.code === combo.code
    : event.key.toLowerCase() === combo.key;
  if (!isKey) return false;
  if (event.metaKey && !combo.command) return false;
  if (combo.typed) return true;
  const isCommand = event.metaKey || event.ctrlKey;
  return (
    isCommand === (combo.command ?? false) &&
    event.altKey === (combo.alt ?? false) &&
    (combo.shift === undefined || event.shiftKey === combo.shift)
  );
}

function isShortcutId(value: string): value is MockupShortcutId {
  return Object.hasOwn(MOCKUP_SHORTCUTS, value);
}

const SHORTCUT_IDS: readonly MockupShortcutId[] =
  Object.keys(MOCKUP_SHORTCUTS).filter(isShortcutId);

function firesIn(shortcut: MockupShortcut, view: MockupView): boolean {
  return (shortcut.views ?? ["current"]).includes(view);
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Whether a key pressed on `target` belongs to it: a field, or a dialog over the viewer. */
export function isFieldKey(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      EDITABLE_TAGS.has(target.tagName) ||
      target.closest("[role=dialog]") !== null)
  );
}

/** Marks an open menu, popover, tooltip or dialog, which takes Escape itself. */
const DISMISSABLE_LAYER = "[data-dismissable-layer]";

/**
 * The shortcuts a key press fires in a view, in the table's order: the first
 * one that acts takes the key. None for Escape while a menu, a popover or a
 * dialog is open, which closes on it.
 */
export function matchShortcuts(
  event: KeyboardEvent,
  view: MockupView = "current",
): MockupShortcutId[] {
  if (event.key === "Escape" && document.querySelector(DISMISSABLE_LAYER)) {
    return [];
  }
  return SHORTCUT_IDS.filter(
    (id) =>
      firesIn(MOCKUP_SHORTCUTS[id], view) &&
      MOCKUP_SHORTCUTS[id].combos.some((combo) => matches(combo, event)),
  );
}

/**
 * The keys of one combination as a keyboard prints them: `meta` is ⌘ on macOS
 * and Ctrl elsewhere, `alt` is ⌥ or Alt, which `keyLabel` resolves.
 */
export function comboKeys(combo: MockupCombo): string[] {
  return [
    ...(combo.command ? ["meta"] : []),
    ...(combo.alt ? ["alt"] : []),
    ...(combo.shift ? ["Shift"] : []),
    KEY_NAMES.get(combo.key) ?? combo.key,
  ];
}

/** The shortcuts of a group, in the sheet's order. */
export function shortcutsOf(group: MockupShortcutGroup): MockupShortcutId[] {
  return SHORTCUT_IDS.filter((id) => MOCKUP_SHORTCUTS[id].group === group);
}
