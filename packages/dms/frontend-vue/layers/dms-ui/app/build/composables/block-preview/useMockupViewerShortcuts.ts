import { computed, onBeforeUnmount, onMounted, type Ref } from "vue";
import {
  isFieldKey,
  isInspectorEscape,
  matchShortcuts,
  type MockupShortcutId,
  type MockupView,
} from "../../utils/mockupShortcuts";
import type { MockupEditing } from "./useMockupEditing";
import type { MockupOverview } from "./useMockupOverview";
import type { MockupPanels } from "./useMockupPanels";
import type { MockupPins } from "./useMockupPins";
import type { MockupSpecEditor } from "./useMockupSpec";
import type { MockupVersions } from "./useMockupVersions";

interface ViewerShortcutsOptions {
  editor: MockupSpecEditor;
  editing: MockupEditing;
  pins: MockupPins;
  panels: MockupPanels;
  history: MockupVersions;
  overview: MockupOverview;
  isOverview: Readonly<Ref<boolean>>;
  isReadOnly: Readonly<Ref<boolean>>;
  isPreviewing: Ref<boolean>;
  showsShortcuts: Ref<boolean>;
  /** Closes the page on screen, back to the Overview. */
  closePage: () => void;
}

/** What the viewer's shortcuts and its top bar do and share. */
export interface ViewerShortcuts {
  undo: () => void;
  redo: () => void;
  /** Tries the shortcuts a key fires in the view the canvas shows, until one acts; true when one did. */
  run: (event: KeyboardEvent) => boolean;
}

function always(act: () => void): () => boolean {
  return () => {
    act();
    return true;
  };
}

/**
 * The viewer's keyboard: the shortcuts table's actions, each of the view the
 * canvas shows, fired by the window's key presses outside a field, by an
 * Escape a field of the inspector left, and by an Escape the preview frame
 * reports. Escape steps back from the innermost
 * thing going on: an armed block, the comment tool, a pin, the selection.
 *
 * A key pressed outside a field is read in the capture phase, before the
 * page's other listeners, and none of them sees one a shortcut acted on; a
 * field's Escape is read in the bubble phase, once the field had its turn.
 */
export function useMockupViewerShortcuts(
  options: ViewerShortcutsOptions,
): ViewerShortcuts {
  const { editor, editing, pins, panels, history, overview } = options;

  function undo(): void {
    if (!editor.canUndo.value) return;
    editor.undo();
    editing.markMoved();
  }

  function redo(): void {
    if (!editor.canRedo.value) return;
    editor.redo();
    editing.markMoved();
  }

  function stepBack(): boolean {
    if (editing.cancelPlacing() || pins.cancel()) return true;
    const hasSelection = editing.selection.value !== undefined;
    editing.selection.value = undefined;
    return hasSelection;
  }

  function onSelection(act: () => void): () => boolean {
    return () => {
      if (editing.selection.value === undefined) return false;
      act();
      return true;
    };
  }

  const actions: Record<MockupShortcutId, () => boolean> = {
    left_panel: always(() => panels.toggle("left")),
    right_panel: always(() => panels.toggle("right")),
    shortcuts: always(() => (options.showsShortcuts.value = true)),
    select_previous: onSelection(() => editing.selectSibling(-1)),
    select_next: onSelection(() => editing.selectSibling(1)),
    move_up: onSelection(() => editing.moveBy(-1)),
    move_down: onSelection(() => editing.moveBy(1)),
    duplicate: onSelection(() => editing.duplicate()),
    remove: onSelection(() => editing.remove()),
    insert_placed: () => editing.insertPlaced(),
    cancel: stepBack,
    comment: always(() => pins.togglePlacing()),
    undo: always(undo),
    redo: always(redo),
    back_to_current: always(history.backToCurrent),
    close_page: always(options.closePage),
    fit_all: always(overview.fitAll),
    preview: always(
      () => (options.isPreviewing.value = !options.isPreviewing.value),
    ),
    close_preview: always(() => (options.isPreviewing.value = false)),
  };

  const view = computed((): MockupView => {
    if (options.isOverview.value) {
      return options.isReadOnly.value ? "overview_version" : "overview";
    }
    if (options.isPreviewing.value) return "preview";
    return options.isReadOnly.value ? "version" : "current";
  });

  function run(event: KeyboardEvent): boolean {
    return matchShortcuts(event, view.value).some((id) => actions[id]());
  }

  function onKeydown(event: KeyboardEvent): void {
    if (isFieldKey(event.target) || !run(event)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onFieldEscape(event: KeyboardEvent): void {
    if (!isFieldKey(event.target) || editing.selection.value === undefined) {
      return;
    }
    if (isInspectorEscape(event) && run(event)) event.preventDefault();
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("keydown", onFieldEscape);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("keydown", onFieldEscape);
  });

  return { undo, redo, run };
}
