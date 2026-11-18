import { computed, ref, type Ref, type ShallowRef } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { MOCKUP_WIDTHS, type MockupWidth } from "../../utils/mockup";
import { fillingHeight } from "../../utils/mockupFrame";

const FRAME_MIN_HEIGHT_PX = 240;

interface FrameSizeOptions {
  /** The canvas the frame is drawn in. */
  canvas: Readonly<ShallowRef<HTMLElement | null>>;
  width: Readonly<Ref<MockupWidth>>;
  /** The height the preview last reported for its page. */
  reportedHeight: Readonly<Ref<number | undefined>>;
}

/**
 * The size the page view draws the preview frame at: its true width, shrunk
 * to fit the canvas, so the page lays out as on that screen, and at least as
 * tall as the canvas shows, so a short page fills the window and a long one
 * scrolls.
 */
export function useMockupFrameSize(options: FrameSizeOptions) {
  const canvasWidth = ref(0);
  const canvasHeight = ref(0);
  useResizeObserver(options.canvas, ([entry]) => {
    canvasWidth.value = entry?.contentRect.width ?? 0;
    canvasHeight.value = entry?.contentRect.height ?? 0;
  });
  const frameWidth = computed(() => MOCKUP_WIDTHS[options.width.value]);
  const scale = computed(() =>
    canvasWidth.value > 0
      ? Math.min(1, canvasWidth.value / frameWidth.value)
      : 1,
  );
  const fillHeight = computed(() =>
    fillingHeight(canvasHeight.value, scale.value),
  );
  const frameHeight = computed(() =>
    Math.max(
      options.reportedHeight.value ?? 0,
      FRAME_MIN_HEIGHT_PX,
      fillHeight.value,
    ),
  );
  const previewStyle = computed(() => ({
    width: `${frameWidth.value}px`,
    height: `${frameHeight.value}px`,
  }));
  return {
    frameWidth,
    frameHeight,
    scale,
    fillHeight,
    previewStyle,
    boxStyle: computed(() => ({
      width: `${frameWidth.value * scale.value}px`,
      height: `${frameHeight.value * scale.value}px`,
    })),
    stageStyle: computed(() => ({
      ...previewStyle.value,
      transform: `scale(${scale.value})`,
      transformOrigin: "top left",
    })),
  };
}
