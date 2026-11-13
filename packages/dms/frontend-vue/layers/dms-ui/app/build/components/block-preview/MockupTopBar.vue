<script setup lang="ts">
import {
  MOCKUP_MODES,
  MOCKUP_WIDTH_OPTIONS,
  type MockupMode,
  type MockupWidth,
} from "../../utils/mockup";

const WIDTH_ICONS: Record<MockupWidth, string> = {
  desktop: "i-ph-desktop",
  mobile: "i-ph-device-mobile",
};

/**
 * The `/mockup` toolbar: the mockup's title, undo and redo, Real data when
 * the page names live routes, the frame width, the Comment and Edit modes,
 * and "Build it".
 */
defineProps<{
  title: string;
  canUndo: boolean;
  canRedo: boolean;
  issueCount: number;
  isConnected: boolean;
  /** Whether the page has live routes to read: the Real data switch shows only then. */
  hasRealData: boolean;
}>();
const width = defineModel<MockupWidth>("width", { required: true });
const mode = defineModel<MockupMode>("mode", { required: true });
const realData = defineModel<boolean>("realData", { required: true });
const emit = defineEmits<{ undo: []; redo: []; build: [] }>();

const { t } = useI18n();
</script>

<template>
  <header
    class="border-default bg-default flex flex-wrap items-center gap-2 border-b px-3 py-2"
    data-dms-mockup-topbar
  >
    <UIcon name="i-ph-diamond" class="text-highlighted size-4" />
    <h1 class="text-highlighted mr-2 truncate text-sm font-semibold">
      {{ title }}
    </h1>
    <UBadge
      :color="issueCount ? 'warning' : 'success'"
      variant="subtle"
      size="sm"
      data-dms-mockup-issue-count
    >
      {{ t("dms.mockup.issues", { count: issueCount }) }}
    </UBadge>
    <span
      v-if="!isConnected"
      class="text-muted text-xs"
      data-dms-mockup-disconnected
    >
      {{ t("dms.mockup.disconnected") }}
    </span>
    <div class="ms-auto flex flex-wrap items-center gap-2">
      <div class="flex gap-0.5">
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-ph-arrow-counter-clockwise"
          :disabled="!canUndo"
          :aria-label="t('dms.mockup.undo')"
          data-dms-mockup-undo
          @click="emit('undo')"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-ph-arrow-clockwise"
          :disabled="!canRedo"
          :aria-label="t('dms.mockup.redo')"
          data-dms-mockup-redo
          @click="emit('redo')"
        />
      </div>
      <USwitch
        v-if="hasRealData"
        v-model="realData"
        size="sm"
        :label="t('dms.mockup.real_data')"
        :title="t('dms.mockup.real_data_hint')"
        data-dms-mockup-real-data
      />
      <div
        class="border-default flex gap-0.5 rounded-md border p-0.5"
        role="group"
        :aria-label="t('dms.mockup.width')"
      >
        <UButton
          v-for="option in MOCKUP_WIDTH_OPTIONS"
          :key="option"
          size="xs"
          color="neutral"
          :variant="option === width ? 'soft' : 'ghost'"
          :icon="WIDTH_ICONS[option]"
          :aria-label="t(`dms.mockup.width_${option}`)"
          :aria-pressed="option === width"
          data-dms-mockup-width
          @click="width = option"
        />
      </div>
      <div
        class="border-default flex gap-0.5 rounded-md border p-0.5"
        role="group"
        :aria-label="t('dms.mockup.mode')"
      >
        <UButton
          v-for="option in MOCKUP_MODES"
          :key="option"
          size="xs"
          color="neutral"
          :variant="option === mode ? 'soft' : 'ghost'"
          :aria-pressed="option === mode"
          :data-dms-mockup-mode="option"
          @click="mode = option"
        >
          {{ t(`dms.mockup.mode_${option}`) }}
        </UButton>
      </div>
      <UButton
        size="sm"
        color="primary"
        icon="i-ph-hammer"
        data-dms-mockup-build
        @click="emit('build')"
      >
        {{ t("dms.mockup.build") }}
      </UButton>
    </div>
  </header>
</template>
