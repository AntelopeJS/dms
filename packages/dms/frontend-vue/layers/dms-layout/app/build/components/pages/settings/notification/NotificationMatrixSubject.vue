<script setup lang="ts">
import type { NotificationSubject } from "../../../../composables/notification/useNotificationCatalog";
import type { SaveStatusState } from "#dms-ui/app/components/save-bar/SaveStatus.vue";
import {
  MATRIX_GRID_CLASS,
  MATRIX_SUBJECT_INDENT_CLASS,
} from "./notificationDisplay";

interface NotificationMatrixSubjectProps {
  subject: NotificationSubject;
  enabled: boolean;
  state: SaveStatusState;
  emailEnabled?: boolean;
}

const props = defineProps<NotificationMatrixSubjectProps>();
const emit = defineEmits<{
  toggle: [enabled: boolean];
  "toggle-email": [enabled: boolean];
  retry: [];
}>();
const { t } = useI18n();

const label = computed(() => t(props.subject.labelKey));
const isLocked = computed(() => props.subject.locked === true);
/** E-mail follows the in-app notification: none is sent without it. */
const isEmailDisabled = computed(() => isLocked.value || !props.enabled);
const emailTitle = computed(() => {
  if (isLocked.value) return t("page.settings.notifications.locked_hint");
  return props.enabled
    ? undefined
    : t("page.settings.notifications.email_needs_in_app");
});

const onToggle = (value: boolean) => {
  if (props.state !== "saving") emit("toggle", value);
};

const onToggleEmail = (value: boolean) => {
  if (props.state !== "saving") emit("toggle-email", value);
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
    <div v-if="props.subject.email" class="flex justify-center" role="cell">
      <USwitch
        :model-value="props.emailEnabled"
        :disabled="isEmailDisabled"
        :title="emailTitle"
        :aria-label="
          t('page.settings.notifications.email_switch', { name: label })
        "
        :aria-busy="props.state === 'saving'"
        data-channel="email"
        @update:model-value="onToggleEmail"
      />
    </div>
    <div
      v-else
      class="text-dimmed flex justify-center font-mono text-xs font-medium"
      role="cell"
    >
      —
    </div>
    <div class="flex justify-end" role="cell">
      <DmsSaveStatus
        v-if="props.state !== 'idle'"
        :state="props.state"
        @retry="emit('retry')"
      />
    </div>
  </div>
</template>
