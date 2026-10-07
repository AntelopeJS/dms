<script setup lang="ts">
import DmsSegmented from "#dms-ui/app/components/segmented/Segmented.vue";
import type { ReduceMotionPreference } from "#dms-ui/app/build/utils/accessibilityPreferences";
import { useAppearanceSave } from "./useAppearanceSave";

const reduceMotionValues: ReduceMotionPreference[] = ["auto", "on", "off"];

const { t } = useI18n();
const { preferences, pick } = useAppearanceSave();

const reduceMotionItems = computed(() =>
  reduceMotionValues.map((value) => ({
    value,
    label: t(`page.settings.appearance.accessibility.motion_${value}`),
  })),
);

function setReduceMotion(value: string | number | undefined): void {
  const next = reduceMotionValues.find((option) => option === value);
  if (next) pick("reduceMotion", next);
}
</script>

<template>
  <div>
    <DmsFieldRow
      label="$page.settings.appearance.accessibility.reduce_motion"
      description="$page.settings.appearance.accessibility.reduce_motion_hint"
    >
      <DmsSegmented
        :model-value="preferences.reduceMotion.value"
        :items="reduceMotionItems"
        :aria-label="t('page.settings.appearance.accessibility.reduce_motion')"
        @update:model-value="setReduceMotion"
      />
    </DmsFieldRow>
    <DmsFieldRow
      label="$page.settings.appearance.accessibility.increase_contrast"
      description="$page.settings.appearance.accessibility.increase_contrast_hint"
    >
      <USwitch
        :model-value="preferences.increaseContrast.value"
        @update:model-value="pick('increaseContrast', $event)"
        :aria-label="
          t('page.settings.appearance.accessibility.increase_contrast')
        "
      />
    </DmsFieldRow>
    <DmsFieldRow
      label="$page.settings.appearance.accessibility.underline_links"
      description="$page.settings.appearance.accessibility.underline_links_hint"
    >
      <USwitch
        :model-value="preferences.underlineLinks.value"
        @update:model-value="pick('underlineLinks', $event)"
        :aria-label="
          t('page.settings.appearance.accessibility.underline_links')
        "
      />
    </DmsFieldRow>
  </div>
</template>
