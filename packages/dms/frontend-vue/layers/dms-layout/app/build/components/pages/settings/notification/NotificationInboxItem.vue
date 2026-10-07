<script setup lang="ts">
import type { UserNotification } from "../../../../../composables/notification/useNotifications";
import {
  MODULE_TAG_CLASS,
  type NotificationSourceTag,
  SOURCE_TAG_CLASS,
  resolveNotificationTone,
} from "./notificationDisplay";

interface NotificationInboxItemProps {
  notification: UserNotification;
  time: string;
  source?: NotificationSourceTag;
}

const props = defineProps<NotificationInboxItemProps>();
const emit = defineEmits<{
  open: [];
  toggleRead: [];
  delete: [];
}>();
const { t } = useI18n();
const { processI18n } = useTranslation();

const isUnread = computed(() => !props.notification.isRead);
const iconWellTone = computed(() => {
  const tone = resolveNotificationTone(props.notification);
  return tone === "neutral" ? "muted" : tone;
});
const readToggleLabel = computed(() =>
  isUnread.value
    ? t("page.settings.notifications.mark_read")
    : t("page.settings.notifications.mark_unread"),
);
// Row actions stay compact until the row is hovered or holds focus, then
// show their labels (v2 C07).
// Hover or focus spells the actions out, except on phones: a tap focuses
// the row, and the labels would squeeze the text there.
const actionLabelUi = {
  label: "hidden sm:group-hover:inline sm:group-focus-within:inline",
};
</script>

<template>
  <DmsListRow
    as="article"
    size="sm"
    marker="leading"
    mono
    interactive
    :unread="isUnread"
    :unread-label="t('page.settings.notifications.unread')"
    :icon="props.notification.icon"
    :tone="iconWellTone"
    class="group relative cursor-pointer focus-within:shadow-[inset_0_0_0_2px_var(--dms-accent-line)] max-sm:grid-cols-1 max-sm:gap-y-1.5"
    @click="emit('open')"
  >
    <button
      type="button"
      class="block text-left outline-none"
      @click.stop="emit('open')"
    >
      {{
        processI18n(props.notification.title ?? "", props.notification.params)
      }}
    </button>
    <template #description>
      {{
        processI18n(
          props.notification.description ?? "",
          props.notification.params,
        )
      }}
    </template>
    <template #meta>
      <time :datetime="props.notification.createdAt">{{ props.time }}</time>
      <span
        v-if="props.source"
        :class="[SOURCE_TAG_CLASS, props.source.isModule && MODULE_TAG_CLASS]"
      >
        {{ props.source.label }}
      </span>
    </template>
    <template #trailing>
      <!-- Phones: the actions drop under the text, end-aligned, instead of
           taking a column from it (the row is one column there). -->
      <div
        class="flex items-center gap-1 opacity-55 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 max-sm:ms-auto"
        @click.stop
      >
        <UButton
          :icon="isUnread ? 'i-ph-check' : 'i-ph-envelope-simple'"
          :label="readToggleLabel"
          :aria-label="readToggleLabel"
          :title="readToggleLabel"
          color="neutral"
          variant="ghost"
          size="xs"
          :ui="actionLabelUi"
          class="group-focus-within:ring-accented group-hover:ring-accented group-focus-within:ring group-hover:ring"
          @click="emit('toggleRead')"
        />
        <UButton
          icon="i-ph-trash"
          :label="t('page.settings.notifications.delete')"
          :aria-label="t('page.settings.notifications.delete_one')"
          :title="t('page.settings.notifications.delete')"
          color="neutral"
          variant="ghost"
          size="xs"
          :ui="actionLabelUi"
          class="group-focus-within:text-error group-hover:text-error"
          @click="emit('delete')"
        />
      </div>
    </template>
  </DmsListRow>
</template>
