<script setup lang="ts">
import { computed, useTemplateRef, watch } from "vue";
import { useTimeoutFn } from "@vueuse/core";
import type { OverviewReport } from "../../composables/block-preview/useMockupOverview";
import { usePreviewFrame } from "../../composables/block-preview/usePreviewFrame";
import {
  previewInspectMessage,
  previewMinHeightMessage,
} from "../../utils/blockPreviewMessages";
import type { MockupCategory, MockupPageState } from "../../utils/mockup";
import { mockupNavigation, mockupPageRender } from "../../utils/mockupFrame";
import {
  OVERVIEW_FRAME_WIDTH,
  OVERVIEW_MIN_HEIGHT,
} from "../../utils/mockupOverview";
import { mockupDataTree, mockupPreviewPath } from "../../utils/mockupRealData";

/**
 * One live frame of the Overview: the real `/dms-preview`, on the mockup's
 * fixtures or, for a page on real data, its live routes, drawing `page` at the desktop width and its full height, at least
 * a desktop window's. The iframe stays when `page` changes and redraws in
 * place, so the Overview moves a few iframes around instead of booting one
 * per page. It reports the page's height and where its blocks sit, for the
 * frame's size and its pins, and says once it booted, which lets the next
 * iframe of the Overview boot: on its preview's first `ready`, or after a
 * while without one, so a preview that fails does not hold the others back.
 * The pointer never reaches it: the canvas pans and zooms, and the frame
 * around it opens the page. The iframe is a compositing layer of its own:
 * without it, every move of the canvas has the browser sort the painted
 * pieces of every live page into layers again, about 26 ms a frame with ten
 * pages, where the layer only moves on the screen.
 */
const props = defineProps<{
  page: MockupPageState;
  /** Every page of the mockup, for the preview's sidebar. */
  pages: readonly MockupPageState[];
  /** The sidebar's sections. */
  categories: readonly MockupCategory[];
  /** The mockup's title, at the top of the sidebar. */
  title: string;
  /** Whether `page` is drawn on its live routes, with its live tree. */
  realData: boolean;
  /** The frame's height, in the page's own pixels. */
  height: number;
}>();

const emit = defineEmits<{
  report: [page: string, report: OverviewReport];
  booted: [];
}>();

const BOOT_TIMEOUT_MS = 15_000;

const { t } = useI18n();
const frame = useTemplateRef<HTMLIFrameElement>("frame");

const navigation = computed(() =>
  mockupNavigation({
    title: props.title,
    categories: props.categories,
    pages: props.pages,
    active: props.page.id,
  }),
);

function sync(): void {
  bridge.post(mockupPageRender(
      props.page,
      mockupDataTree(props.page, props.realData),
      navigation.value,
    ));
  bridge.post(previewInspectMessage(true));
  bridge.post(previewMinHeightMessage(OVERVIEW_MIN_HEIGHT));
}

const src = computed(() => mockupPreviewPath(props.realData));

const fallback = useTimeoutFn(() => emit("booted"), BOOT_TIMEOUT_MS);

const bridge = usePreviewFrame({
  frame,
  onReady: () => {
    fallback.stop();
    emit("booted");
    sync();
  },
  onSelect: () => undefined,
  onLayout: (blocks) =>
    emit("report", props.page.id, { blocks, height: bridge.height.value }),
});

watch([() => props.page, () => props.realData, navigation], sync);
watch(bridge.height, (height) => {
  if (height !== undefined) emit("report", props.page.id, { height });
});
</script>

<template>
  <iframe
    ref="frame"
    :key="src"
    class="bg-default pointer-events-none block rounded-md border-0 will-change-transform"
    :src="src"
    :style="{ width: `${OVERVIEW_FRAME_WIDTH}px`, height: `${height}px` }"
    :title="t('dms.mockup.thumbnail_title', { name: page.title })"
    tabindex="-1"
    aria-hidden="true"
    data-dms-mockup-overview-preview
  />
</template>
