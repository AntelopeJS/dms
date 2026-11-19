import { computed, type Ref } from "vue";
import type { MockupPanels } from "./useMockupPanels";

const GRID_COLUMNS = {
  both: "grid-cols-[16rem_minmax(0,1fr)_20rem]",
  left: "grid-cols-[16rem_minmax(0,1fr)]",
  right: "grid-cols-[minmax(0,1fr)_20rem]",
  none: "grid-cols-[minmax(0,1fr)]",
};

interface GridLayoutOptions {
  panels: MockupPanels;
  /** The editing panels show on the current spec's page view alone. */
  canEdit: Readonly<Ref<boolean>>;
  isHistoryOpen: Readonly<Ref<boolean>>;
}

/**
 * Which side panels the viewer shows, and the grid columns they leave the
 * canvas: the block panels on the left and the inspector on the right when
 * their toggles are open and the spec can be edited, the history in place of
 * the inspector while it is open.
 */
export function useMockupGridLayout(options: GridLayoutOptions) {
  const showsLeft = computed(
    () => options.panels.open.value.left && options.canEdit.value,
  );
  const showsInspector = computed(
    () =>
      options.panels.open.value.right &&
      options.canEdit.value &&
      !options.isHistoryOpen.value,
  );
  const showsRight = computed(
    () => showsInspector.value || options.isHistoryOpen.value,
  );
  const gridClass = computed(() => {
    if (showsLeft.value && showsRight.value) return GRID_COLUMNS.both;
    if (showsLeft.value) return GRID_COLUMNS.left;
    return showsRight.value ? GRID_COLUMNS.right : GRID_COLUMNS.none;
  });
  return { showsLeft, showsInspector, gridClass };
}
