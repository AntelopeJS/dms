<script setup lang="ts">
import type { NotificationSubject } from "../../../../../composables/notification/useNotificationCatalog";
import type { PreferenceRowState } from "../../../../../composables/notification/useNotificationPreferences";
import {
  MATRIX_GRID_CLASS,
  MATRIX_SUBJECT_INDENT_CLASS,
} from "./notificationDisplay";

interface NotificationMatrixSubjectProps {
  subject: NotificationSubject;
  enabled: boolean;
  state: PreferenceRowState;
}

const props = defineProps<NotificationMatrixSubjectProps>();
const emit = defineEmits<{ toggle: [enabled: boolean] }>();
const { t } = useI18n();

const label = computed(() => t(props.subject.labelKey));
const isLocked = computed(() => props.subject.locked === true);

// A second click while the first save is in flight would race it; the row
// stays interactive-looking (v2 shows the switch at full strength) and the
// click is dropped instead.
const onToggle = (value: boolean) => {
  if (props.state !== "saving") emit("toggle", value);
};
</script>

<template>
  <div
    :class="MATRIX_GRID_CLASS"
    class="border-muted min-h-[50px] border-t py-2"
    role="row"
  >
    <div class="min-w-0" :class="MATRIX_SUBJECT_INDENT_CLASS" role="rowheader">
      <div
        class="flex flex-wrap items-center gap-2 text-[13px] font-[550]"
        :class="props.enabled ? 'text-highlighted' : 'text-muted'"
      >
        {{ label }}
        <UIcon
          v-if="isLocked"
          name="i-ph-lock-simple"
          class="text-dimmed size-3.5"
          :aria-label="t('page.settings.notifications.locked_hint')"
        />
        <UBadge
          v-if="props.subject.badgeKey"
          color="neutral"
          size="sm"
          :label="t(props.subject.badgeKey)"
        />
      </div>
      <p
        v-if="props.subject.descriptionKey"
        class="text-muted mt-px text-[12.5px] leading-normal"
      >
        {{ t(props.subject.descriptionKey) }}
      </p>
    </div>
    <div class="flex items-center justify-center" role="cell">
      <USwitch
        :model-value="props.enabled"
        :disabled="isLocked"
        :title="
          isLocked ? t('page.settings.notifications.locked_hint') : undefined
        "
        :aria-label="label"
        :aria-busy="props.state === 'saving'"
        @update:model-value="onToggle"
      />
    </div>
    <div
      class="text-dimmed flex justify-center font-mono text-xs font-medium"
      role="cell"
    >
      —
    </div>
    <div class="flex justify-end" role="cell">
      <DmsSaveStatus v-if="props.state !== 'idle'" :state="props.state" />
    </div>
  </div>
</template>
