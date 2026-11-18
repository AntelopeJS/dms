<script setup lang="ts">
import { computed, ref } from "vue";
import BrandingAccentPicker from "./BrandingAccentPicker.vue";
import { backgroundHex } from "./color-input";
import { ACCENT_SWATCHES, paletteShade, THEME_PALETTES } from "./catalog";

/**
 * A row of palette swatches, the selected one ringed, a custom color after
 * them, every palette behind "more". `customColor` is the color of a custom
 * accent the theme holds, which makes the custom swatch the selected one.
 */
const props = defineProps<{
  selected: string | undefined;
  customColor?: string | undefined;
}>();
const emit = defineEmits<{
  select: [palette: string];
  custom: [color: string];
}>();

const { t } = useI18n();

const FALLBACK_COLOR = "#06b6d4";

const row = ref<HTMLElement | null>(null);
const seed = ref(FALLBACK_COLOR);

const shown = computed(() =>
  props.selected &&
  !ACCENT_SWATCHES.includes(props.selected) &&
  props.customColor === undefined
    ? [...ACCENT_SWATCHES, props.selected]
    : ACCENT_SWATCHES,
);

/** The picker opens on the custom color, else on the color of the selected swatch. */
function primePicker(isOpen: boolean): void {
  if (!isOpen) return;
  const selectedSwatch = row.value?.querySelector(
    "[data-palette][aria-pressed='true']",
  );
  seed.value = selectedSwatch ? backgroundHex(selectedSwatch) : FALLBACK_COLOR;
}

const swatchClass = (isSelected: boolean) => [
  "size-6 shrink-0 rounded-[calc(var(--ui-radius)*1.5)] transition-shadow",
  isSelected
    ? "ring-2 ring-highlighted ring-offset-2 ring-offset-(--ui-bg)"
    : "ring ring-inset ring-black/10",
];
</script>

<template>
  <div ref="row" class="flex flex-wrap items-center gap-1.5">
    <button
      v-for="palette in shown"
      :key="palette"
      type="button"
      :data-palette="palette"
      :class="swatchClass(palette === props.selected)"
      :style="{ background: paletteShade(palette, 500) }"
      :aria-label="t('branding.accent.palette', { name: palette })"
      :aria-pressed="palette === props.selected"
      @click="emit('select', palette)"
    />
    <UPopover @update:open="primePicker">
      <button
        type="button"
        data-custom-accent
        :class="swatchClass(props.customColor !== undefined)"
        :style="{
          background:
            props.customColor ??
            'conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)',
        }"
        :aria-label="t('branding.accent.custom')"
        :aria-pressed="props.customColor !== undefined"
      />
      <template #content>
        <BrandingAccentPicker
          :model-value="props.customColor ?? seed"
          @update:model-value="(color) => emit('custom', color)"
        />
      </template>
    </UPopover>
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
            :class="swatchClass(palette === props.selected)"
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
