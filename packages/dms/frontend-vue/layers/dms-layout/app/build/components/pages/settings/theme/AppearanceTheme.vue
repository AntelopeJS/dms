<script setup lang="ts">
import AppearanceOptionTile from "./AppearanceOptionTile.vue";
import ThemePreview from "./ThemePreview.vue";
import { useAppearanceSave } from "./useAppearanceSave";

interface AppearanceColorOption {
  value: ColorModePreference;
  label: string;
  hint: string;
  icon: string;
}

const colorOptions: AppearanceColorOption[] = [
  {
    value: "system",
    label: "$page.settings.appearance.system",
    hint: "$page.settings.appearance.system_hint",
    icon: "i-ph-desktop",
  },
  {
    value: "light",
    label: "$page.settings.appearance.light",
    hint: "$page.settings.appearance.light_hint",
    icon: "i-ph-sun",
  },
  {
    value: "dark",
    label: "$page.settings.appearance.dark",
    hint: "$page.settings.appearance.dark_hint",
    icon: "i-ph-moon",
  },
];

const { preferences, pick } = useAppearanceSave();

function pickColorMode(value: string): void {
  const option = colorOptions.find((entry) => entry.value === value);
  if (option) pick("colorMode", option.value);
}
</script>

<template>
  <div class="grid grid-cols-1 gap-3.5 p-[18px] sm:grid-cols-3">
    <AppearanceOptionTile
      v-for="option in colorOptions"
      :key="option.value"
      :model-value="preferences.colorMode.value"
      name="color-mode"
      :value="option.value"
      :label="option.label"
      :hint="option.hint"
      :icon="option.icon"
      @update:model-value="pickColorMode"
    >
      <template #preview>
        <ThemePreview :mode="option.value" class="h-[118px] w-full" />
      </template>
    </AppearanceOptionTile>
  </div>
</template>
