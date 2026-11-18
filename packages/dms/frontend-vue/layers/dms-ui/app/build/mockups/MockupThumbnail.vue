<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef, watch } from "vue";
import { useElementVisibility, useResizeObserver } from "@vueuse/core";
import { usePreviewFrame } from "../composables/block-preview/usePreviewFrame";
import { isPreviewTheme } from "../utils/blockPreview";
import { previewRenderMessage } from "../utils/blockPreviewMessages";
import {
  MOCKUP_WIDTHS,
  mockupEndpoint,
  parseMockupState,
  type MockupState,
} from "../utils/mockup";
import {
  mockupDataTree,
  mockupPreviewPath,
  readsRealData,
} from "../utils/mockupRealData";
import { mockupNavigation } from "../utils/mockupFrame";
import { currentSketchScheme } from "../utils/sketch";

/**
 * A live, scaled-down drawing of the whole first page of a mockup: the real
 * `/dms-preview` (on live routes for a page converted from a live page), at desktop width and a 16:10 screen, shrunk to the card's
 * width. It reads the mockup and loads the frame once the thumbnail scrolls
 * into view, and leaves a quiet placeholder when the mockup cannot be read or
 * has no page to draw.
 */
const props = defineProps<{ name: string }>();

const SCREEN_HEIGHT_PX = (MOCKUP_WIDTHS.desktop * 10) / 16;

const { t } = useI18n();
const { $authFetch } = useAuthFetch();

const band = useTemplateRef<HTMLElement>("band");
const frame = useTemplateRef<HTMLIFrameElement>("frame");
const hasBeenSeen = ref(false);
const isLoaded = ref(false);
const isDrawn = ref(false);
const state = shallowRef<MockupState>();
const bandWidth = ref(0);

const isInView = useElementVisibility(band);
useResizeObserver(band, ([entry]) => {
  bandWidth.value = entry?.contentRect.width ?? 0;
});

const page = computed(() => state.value?.pages[0]);
/** A page converted from a live page is drawn on its live routes, the others on fixtures that refuse them. */
const previewPath = computed(() =>
  mockupPreviewPath(readsRealData(page.value, undefined)),
);
const isUnavailable = computed(() => isLoaded.value && !page.value);
const scale = computed(() => bandWidth.value / MOCKUP_WIDTHS.desktop);
const stageStyle = computed(() => ({
  width: `${MOCKUP_WIDTHS.desktop}px`,
  height: `${SCREEN_HEIGHT_PX}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: "top left",
}));

const navigation = computed(() =>
  mockupNavigation({
    title: state.value?.title || props.name,
    categories: state.value?.categories ?? [],
    pages: state.value?.pages ?? [],
    active: page.value?.id,
    widgets: state.value?.sidebar?.widgets,
  }),
);

function syncPreview(): void {
  const current = page.value;
  if (!current) return;
  bridge.post(
    previewRenderMessage({
      tree: mockupDataTree(current, readsRealData(current, undefined)),
      theme: isPreviewTheme(current.options.theme)
        ? current.options.theme
        : currentSketchScheme(),
      locale: current.options.locale,
      padding: current.options.padding ?? true,
      navigation: navigation.value,
    }),
  );
  isDrawn.value = true;
}

const bridge = usePreviewFrame({
  frame,
  onReady: syncPreview,
  onSelect: () => undefined,
});

async function load(): Promise<void> {
  try {
    state.value = parseMockupState(
      await $authFetch(mockupEndpoint(props.name)),
    );
  } catch {
    state.value = undefined;
  }
  isLoaded.value = true;
}

watch(isInView, (inView) => {
  if (!inView || hasBeenSeen.value) return;
  hasBeenSeen.value = true;
  void load();
});
</script>

<template>
  <div
    ref="band"
    class="bg-muted border-default relative aspect-[16/10] overflow-hidden border-b"
    aria-hidden="true"
    data-dms-mockup-thumbnail
  >
    <div v-if="isUnavailable" class="grid h-full place-items-center">
      <UIcon
        name="i-lucide-layout-template"
        class="text-dimmed size-8"
        data-dms-mockup-thumbnail-placeholder
      />
    </div>
    <div
      v-else-if="page && scale > 0"
      class="pointer-events-none absolute top-0 left-0"
      :style="stageStyle"
    >
      <iframe
        ref="frame"
        :key="previewPath"
        class="bg-default block size-full border-0 transition-opacity duration-200 motion-reduce:transition-none"
        :class="isDrawn ? 'opacity-100' : 'opacity-0'"
        :src="previewPath"
        :title="t('dms.mockup.thumbnail_title', { name: props.name })"
        tabindex="-1"
        aria-hidden="true"
      />
    </div>
  </div>
</template>
