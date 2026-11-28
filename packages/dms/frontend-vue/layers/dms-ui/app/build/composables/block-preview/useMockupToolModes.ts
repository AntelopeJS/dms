import { computed, nextTick, ref, watch, type Ref } from "vue";
import { detach } from "../detach";
import { previewInspectMessage } from "../../utils/blockPreviewMessages";
import type { MockupEditing } from "./useMockupEditing";
import type { MockupPins } from "./useMockupPins";
import type { PreviewFrame } from "./usePreviewFrame";

interface ToolModesOptions {
  editing: MockupEditing;
  pins: MockupPins;
  isOverview: Readonly<Ref<boolean>>;
  /** The viewer reviews the mockup and edits nothing: the page runs as in Preview, under the pins. */
  isReviewing: Readonly<Ref<boolean>>;
  post: PreviewFrame["post"];
  /** Gives the focus to the canvas, once the page shows. */
  focusCanvas: () => void;
}

/**
 * The modes the canvas is in, which exclude one another: Preview hands every
 * click to the page, so no block stays selected and no tool stays armed; a
 * block armed and the comment tool never are both; the Overview places no
 * block and leaves Preview, to comment on every page, and gives the focus
 * back to the page once it shows again. A reviewer's page runs as in
 * Preview whatever the toggle says, since nothing of it is selected to edit.
 */
export function useMockupToolModes(options: ToolModesOptions) {
  const { editing, pins, post } = options;
  const isPreviewing = ref(false);
  const inspects = computed(
    () => !isPreviewing.value && !options.isReviewing.value,
  );

  watch(isPreviewing, (isOn) => {
    if (isOn) {
      editing.selection.value = undefined;
      editing.cancelPlacing();
      pins.cancel();
      pins.isPlacing.value = false;
    }
    post(previewInspectMessage(inspects.value));
  });
  watch(
    () => editing.placing.value,
    (armed) => {
      if (armed) pins.isPlacing.value = false;
    },
  );
  watch(
    () => pins.isPlacing.value,
    (armed) => {
      if (armed) editing.cancelPlacing();
    },
  );
  watch(options.isOverview, (isShown) => {
    if (!isShown) {
      detach(nextTick(options.focusCanvas));
      return;
    }
    editing.cancelPlacing();
    isPreviewing.value = false;
  });

  return {
    isPreviewing,
    /** Whether the page's blocks answer a click with a selection: not in Preview, nor for a reviewer. */
    inspects,
    /** The tool armed, which the banner says; the comment tool and a placed block never are both. */
    mode: computed(() => {
      if (pins.isPlacing.value) return { kind: "comment" as const };
      const armed = editing.placing.value;
      return armed ? { kind: "place" as const, name: armed.name } : undefined;
    }),
  };
}
