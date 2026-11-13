<script setup lang="ts">
import { ref } from "vue";
import { backgroundHex } from "./color-input";
import { THEME_MODES, type ThemeMode } from "./theme-types";

/**
 * A background row: a split swatch, light half and dark half, each painted
 * with the preview's tokens for its mode and opening a color input for it.
 */
const props = defineProps<{
  label: string;
  name: string;
  styles: Record<ThemeMode, Record<string, string>>;
  previewMode: ThemeMode;
}>();

const emit = defineEmits<{ update: [mode: ThemeMode, value: string] }>();

const { t } = useI18n();
const halves: Partial<Record<ThemeMode, HTMLElement | null>> = {};
const pickerValue = ref<Record<ThemeMode, string>>({
  light: "#ffffff",
  dark: "#000000",
});

function setHalf(mode: ThemeMode, element: unknown): void {
  halves[mode] = element instanceof HTMLElement ? element : null;
}

function prime(mode: ThemeMode): void {
  pickerValue.value[mode] = backgroundHex(halves[mode] ?? null);
}

function onInput(mode: ThemeMode, event: Event): void {
  if (event.target instanceof HTMLInputElement) {
    emit("update", mode, event.target.value);
  }
}
</script>

<template>
  <div class="flex items-center justify-between gap-3">
    <span class="text-highlighted text-sm">{{ props.label }}</span>
    <div
      class="flex h-5 w-8 overflow-hidden rounded-[calc(var(--ui-radius)*1.5)] ring ring-(--ui-border-accented)"
    >
      <label
        v-for="mode in THEME_MODES"
        :key="mode"
        class="relative flex-1 cursor-pointer"
        :class="mode === props.previewMode ? 'ring-primary z-10 ring-2' : ''"
        @pointerdown="prime(mode)"
        @focusin="prime(mode)"
      >
        <span :style="props.styles[mode]" class="absolute inset-0 block">
          <span
            :ref="(element) => setHalf(mode, element)"
            class="block size-full"
            :style="{ background: `var(${props.name})` }"
          />
        </span>
        <input
          type="color"
          class="absolute inset-0 size-full cursor-pointer opacity-0"
          :value="pickerValue[mode]"
          :aria-label="
            t('branding.background.edit', {
              name: props.label,
              mode: t(`branding.developer.${mode}`),
            })
          "
          @input="onInput(mode, $event)"
        />
      </label>
    </div>
  </div>
</template>
