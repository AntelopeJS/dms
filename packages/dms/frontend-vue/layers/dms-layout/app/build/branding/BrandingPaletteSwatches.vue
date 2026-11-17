<script setup lang="ts">
import { computed } from "vue";
import { ACCENT_SWATCHES, paletteShade, THEME_PALETTES } from "./catalog";

/** A row of palette swatches, the selected one ringed, every palette behind "more". */
const props = defineProps<{ selected: string | undefined }>();
const emit = defineEmits<{ select: [palette: string] }>();

const { t } = useI18n();

const shown = computed(() =>
  props.selected && !ACCENT_SWATCHES.includes(props.selected)
    ? [...ACCENT_SWATCHES, props.selected]
    : ACCENT_SWATCHES,
);

const swatchClass = (palette: string) => [
  "size-6 shrink-0 rounded-[calc(var(--ui-radius)*1.5)] transition-shadow",
  palette === props.selected
    ? "ring-2 ring-highlighted ring-offset-2 ring-offset-(--ui-bg)"
    : "ring ring-inset ring-black/10",
];
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <button
      v-for="palette in shown"
      :key="palette"
      type="button"
      :data-palette="palette"
      :class="swatchClass(palette)"
      :style="{ background: paletteShade(palette, 500) }"
      :aria-label="t('branding.accent.palette', { name: palette })"
      :aria-pressed="palette === props.selected"
      @click="emit('select', palette)"
    />
    <UPopover>
      <UButton
        icon="i-ph-dots-three-light"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="t('branding.accent.more')"
      />
      <template #content>
        <div class="grid w-56 grid-cols-6 gap-1.5 p-2">
          <button
            v-for="palette in THEME_PALETTES"
            :key="palette"
            type="button"
            :data-palette="palette"
            :class="swatchClass(palette)"
            :style="{ background: paletteShade(palette, 500) }"
            :aria-label="t('branding.accent.palette', { name: palette })"
            :aria-pressed="palette === props.selected"
            @click="emit('select', palette)"
          />
        </div>
      </template>
    </UPopover>
  </div>
</template>
