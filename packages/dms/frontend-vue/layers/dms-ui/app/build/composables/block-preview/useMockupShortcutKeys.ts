import { useKeyboardPlatform } from "../../../composables/global/keyboardPlatform";
import {
  MOCKUP_SHORTCUTS,
  comboKeys,
  type MockupShortcutId,
} from "../../utils/mockupShortcuts";

/** The keys of the viewer's shortcuts as this keyboard prints them: ⌘ and ⌥ on macOS, Ctrl and Alt elsewhere. */
export interface MockupShortcutKeys {
  /** The keys of the combination shown for a shortcut, one badge each. */
  keysOf: (id: MockupShortcutId) => string[];
  /** The keys of every combination that fires a shortcut. */
  combosOf: (id: MockupShortcutId) => string[][];
}

/** Reads the shortcuts table with the labels of the keyboard in use. */
export function useMockupShortcutKeys(): MockupShortcutKeys {
  const { keyLabel } = useKeyboardPlatform();

  function combosOf(id: MockupShortcutId): string[][] {
    return MOCKUP_SHORTCUTS[id].combos.map((combo) =>
      comboKeys(combo).map(keyLabel),
    );
  }

  return { keysOf: (id) => combosOf(id)[0] ?? [], combosOf };
}
