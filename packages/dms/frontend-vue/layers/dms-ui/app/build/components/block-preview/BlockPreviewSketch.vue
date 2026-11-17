<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import type { PreviewSketch } from "../../utils/blockPreview";
import {
  buildSketchDocument,
  computedStyleReader,
  currentSketchScheme,
  sketchTokensCss,
} from "../../utils/sketch";

defineOptions({ inheritAttrs: false });

/**
 * Draws a sketch node: static HTML and CSS of a part that is not a DMS block,
 * in a sandboxed frame, marked as custom so it is never mistaken for a block.
 */
const props = defineProps<{ sketch: PreviewSketch }>();

const OBSERVED_ATTRIBUTES = ["class", "style"];

const { t } = useI18n();
const host = useTemplateRef<HTMLElement>("host");
const themeRevision = ref(0);
let observer: MutationObserver | undefined;

onMounted(() => {
  themeRevision.value += 1;
  observer = new MutationObserver(() => {
    themeRevision.value += 1;
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: OBSERVED_ATTRIBUTES,
  });
});
onBeforeUnmount(() => observer?.disconnect());

const label = computed(() => t("dms.block_preview.sketch_label"));
const srcdoc = computed(() => {
  if (themeRevision.value === 0 || !host.value) return "";
  const tokens = sketchTokensCss(
    currentSketchScheme(),
    computedStyleReader(host.value),
  );
  return buildSketchDocument(props.sketch, tokens);
});
</script>

<template>
  <figure
    ref="host"
    class="m-0 space-y-2 rounded-(--dms-radius-card) bg-[repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--ui-border)_70%,transparent)_0_6px,transparent_6px_12px)] p-2 outline-1 -outline-offset-1 outline-(--ui-border-accented) outline-dashed"
    data-dms-preview-sketch
  >
    <figcaption
      class="text-muted flex items-center gap-2 font-mono text-[10.5px] font-[650] tracking-[0.08em] uppercase"
    >
      <span data-dms-preview-sketch-label>{{ label }}</span>
      <span
        v-if="sketch.caption"
        class="font-sans text-xs font-normal tracking-normal normal-case"
        data-dms-preview-sketch-caption
      >
        {{ sketch.caption }}
      </span>
    </figcaption>
    <iframe
      v-if="srcdoc"
      sandbox=""
      referrerpolicy="no-referrer"
      class="bg-default block w-full rounded-md border-0"
      :title="sketch.caption || label"
      :srcdoc="srcdoc"
      :style="{ height: `${sketch.height}px` }"
    />
  </figure>
</template>
