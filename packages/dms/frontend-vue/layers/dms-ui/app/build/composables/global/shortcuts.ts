import {
  GLOBAL_META_SLASH_METADATA,
  GLOBAL_SLASH_METADATA,
} from "./searchShortcuts";

const GLOBAL_COMPONENT = "$dms.components.global";

/** Opens the command palette from anywhere in the dashboard. */
export const GLOBAL_META_K_METADATA: ShortcutMetadata = {
  key: ["$keyboard.meta", "k"],
  descriptionKey: "$dms.shortcuts.global.meta_k.description",
  component: GLOBAL_COMPONENT,
};

/** Opens the keyboard shortcuts page from anywhere outside a text field. */
export const GLOBAL_QUESTION_MARK_METADATA: ShortcutMetadata = {
  key: ["?"],
  descriptionKey: "$dms.shortcuts.global.question_mark.description",
  component: GLOBAL_COMPONENT,
  condition: {
    descriptionKey: "$dms.shortcuts.global.question_mark.condition",
  },
};

/** Closes the topmost dialog, menu or the command palette. */
export const GLOBAL_ESCAPE_METADATA: ShortcutMetadata = {
  key: ["$keyboard.escape"],
  descriptionKey: "$dms.shortcuts.global.escape.description",
  component: GLOBAL_COMPONENT,
};

/**
 * Shortcuts the dashboard shell handles everywhere. They are only listed for
 * the shortcuts page: the shell components bind them themselves.
 */
export const GLOBAL_SHORTCUTS_METADATA = [
  GLOBAL_META_K_METADATA,
  GLOBAL_SLASH_METADATA,
  GLOBAL_META_SLASH_METADATA,
  GLOBAL_QUESTION_MARK_METADATA,
  GLOBAL_ESCAPE_METADATA,
];
