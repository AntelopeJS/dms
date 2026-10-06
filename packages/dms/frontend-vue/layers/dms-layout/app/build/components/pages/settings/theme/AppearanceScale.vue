<script setup lang="ts">
import AppearanceOptionTile from "./AppearanceOptionTile.vue";
import ScalePreview from "./ScalePreview.vue";
import { useAppearanceSave } from "./useAppearanceSave";

interface AppearanceScaleOption {
  value: InterfaceScale;
  label: string;
  hint: string;
}

const scaleOptions: AppearanceScaleOption[] = [
  {
    value: "small",
    label: "$page.settings.appearance.scale_small",
    hint: "$page.settings.appearance.scale_small_hint",
  },
  {
    value: "normal",
    label: "$page.settings.appearance.scale_normal",
    hint: "$page.settings.appearance.scale_normal_hint",
  },
  {
    value: "large",
    label: "$page.settings.appearance.scale_large",
    hint: "$page.settings.appearance.scale_large_hint",
  },
];

const { preferences, pick } = useAppearanceSave();

function pickScale(value: string): void {
  const option = scaleOptions.find((entry) => entry.value === value);
  if (option) pick("interfaceScale", option.value);
}
</script>

<template>
  <div class="grid grid-cols-1 gap-3.5 p-[18px] sm:grid-cols-3">
    <AppearanceOptionTile
      v-for="option in scaleOptions"
      :key="option.value"
      :model-value="preferences.interfaceScale.value"
      name="interface-scale"
      :value="option.value"
      :label="option.label"
      :hint="option.hint"
      @update:model-value="pickScale"
    >
      <template #preview>
        <ScalePreview :scale="option.value" class="h-[118px] w-full" />
      </template>
    </AppearanceOptionTile>
  </div>
</template>
