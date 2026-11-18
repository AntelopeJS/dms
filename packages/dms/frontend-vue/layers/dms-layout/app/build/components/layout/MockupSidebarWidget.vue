<script setup lang="ts">
import BlockPreviewSketch from "#dms-ui/app/entries/components/block-preview/BlockPreviewSketch";
import type { PreviewSidebarWidget } from "#dms-ui/app/entries/utils/blockPreview";

/**
 * A mockup's widget sketch in the dashboard's sidebar. On the rail it shrinks
 * to a chip, as a real sidebar widget shrinks to an icon, marked Custom as the
 * sketch is, its caption on hover. Otherwise it draws the whole sketch under
 * its caption.
 */
const props = defineProps<{
  widget: PreviewSidebarWidget;
  collapsed: boolean;
}>();

const { t } = useI18n();

const label = computed(() => {
  const custom = t("dms.block_preview.sketch_label");
  return props.widget.caption ? `${custom} · ${props.widget.caption}` : custom;
});
</script>

<template>
  <div
    :data-dms-preview-sidebar-widget="widget.id"
    :data-collapsed="collapsed || undefined"
  >
    <div
      v-if="collapsed"
      role="img"
      :aria-label="label"
      :title="label"
      class="grid h-9 place-items-center rounded-md bg-[repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--ui-border)_70%,transparent)_0_6px,transparent_6px_12px)] outline-1 -outline-offset-1 outline-(--ui-border-accented) outline-dashed"
    >
      <UIcon name="i-ph-puzzle-piece-light" class="text-muted size-4" />
    </div>
    <BlockPreviewSketch v-else :sketch="widget" />
  </div>
</template>
