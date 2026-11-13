<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useElementVisibility, useResizeObserver } from "@vueuse/core";
import { usePreviewFrame } from "../composables/block-preview/usePreviewFrame";
import { isPreviewTheme } from "../utils/blockPreview";
import {
  previewRenderMessage,
  type PreviewNavigation,
} from "../utils/blockPreviewMessages";
import {
  MOCKUP_WIDTHS,
  mockupEndpoint,
  parseMockupState,
  type MockupState,
} from "../utils/mockup";
import { currentSketchScheme } from "../utils/sketch";

/**
 * A live, scaled-down drawing of the first page of a mockup: the real
 * `/dms-preview`, at desktop width, shrunk to the band. It reads the mockup
 * and loads the frame once the band scrolls into view, and leaves a quiet
 * placeholder when the mockup cannot be read or has no page to draw.
 */
const props = defineProps<{ name: string }>();

const PREVIEW_PATH = "/dms-preview";
const BAND_HEIGHT_PX = 84;
const HOME_ICON = "i-ph-house-light";

const { t } = useI18n();
const { $authFetch } = useAuthFetch();

const band = useTemplateRef<HTMLElement>("band");
const frame = useTemplateRef<HTMLIFrameElement>("frame");
const hasBeenSeen = ref(false);
const isLoaded = ref(false);
const state = ref<MockupState>();
const bandWidth = ref(0);

const isInView = useElementVisibility(band);
useResizeObserver(band, ([entry]) => {
  bandWidth.value = entry?.contentRect.width ?? 0;
});

const page = computed(() => state.value?.pages[0]);
const isUnavailable = computed(() => isLoaded.value && !page.value);
const scale = computed(() => bandWidth.value / MOCKUP_WIDTHS.desktop);
const stageStyle = computed(() => ({
  width: `${MOCKUP_WIDTHS.desktop}px`,
  height: `${BAND_HEIGHT_PX / scale.value}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: "top left",
}));

const navigation = computed(
  (): PreviewNavigation => ({
    title: state.value?.title || props.name,
    items: (state.value?.pages ?? []).map((entry, index) => ({
      id: entry.id,
      label: entry.title,
      icon: index === 0 ? HOME_ICON : undefined,
    })),
    active: page.value?.id,
  }),
);

function syncPreview(): void {
  const current = page.value;
  if (!current) return;
  bridge.post(
    previewRenderMessage({
      tree: current.tree,
      theme: isPreviewTheme(current.options.theme)
        ? current.options.theme
        : currentSketchScheme(),
      locale: current.options.locale,
      padding: current.options.padding ?? true,
      navigation: navigation.value,
    }),
  );
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
    class="bg-muted relative overflow-hidden"
    :style="{ height: `${BAND_HEIGHT_PX}px` }"
    aria-hidden="true"
    data-dms-mockup-thumbnail
  >
    <div v-if="isUnavailable" class="grid h-full place-items-center">
      <UIcon
        name="i-ph-frame-corners-light"
        class="text-dimmed size-6"
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
        class="bg-default block size-full border-0"
        :src="PREVIEW_PATH"
        :title="t('dms.mockup.thumbnail_title', { name: props.name })"
        tabindex="-1"
        aria-hidden="true"
      />
    </div>
  </div>
</template>
