<script setup lang="ts">
import { formatRelativeTime } from "#dms-core/app/utils/formatter";
import NotificationCard from "../../../notification/NotificationCard.vue";

const { t, locale } = useI18n();
const { processI18n } = useTranslation();
const toast = useToast();
const {
  notifications,
  hasMore,
  fetchNotifications,
  markAsRead,
  deleteNotification,
  markAllAsRead,
  deleteAll,
} = useNotifications();
const sentinel = ref<HTMLElement | null>(null);

const isMarkingAllRead = ref(false);
const isDeletingAll = ref(false);

const hasNotifications = computed(() => notifications.value.length > 0);

const { isLoadingMore, setupObserver } = useInfiniteScroll(
  sentinel,
  () => fetchNotifications(),
  hasMore,
);

onMounted(async () => {
  await fetchNotifications(true);
  setupObserver();
});

const handleNotificationClick = async (notification: UserNotification) => {
  if (!notification.isRead) {
    await markAsRead(notification._id);
  }

  if (notification.linkTo) {
    await navigateDms(notification.linkTo);
  }
};

const handleDelete = async (notificationId: string, event: Event) => {
  event.stopPropagation();
  await deleteNotification(notificationId);
};

const handleMarkAsReadSingle = async (notificationId: string, event: Event) => {
  event.stopPropagation();
  await markAsRead(notificationId);
};

const handleMarkAllAsRead = async () => {
  isMarkingAllRead.value = true;

  try {
    await markAllAsRead();
    toast.add({
      title: t("page.settings.notifications.mark_all_read_success"),
      color: "success",
    });
  } catch {
    toast.add({
      title: t("dms.form.error_title"),
      color: "error",
    });
  } finally {
    isMarkingAllRead.value = false;
  }
};

const handleDeleteAll = async () => {
  isDeletingAll.value = true;

  try {
    await deleteAll();
    toast.add({
      title: t("page.settings.notifications.delete_all_success"),
      color: "success",
    });
  } catch {
    toast.add({
      title: t("dms.form.error_title"),
      color: "error",
    });
  } finally {
    isDeletingAll.value = false;
  }
};
</script>

<template>
  <div>
    <section class="mb-6 space-y-6">
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-1">
          <h2 class="text-highlighted text-2xl font-semibold sm:text-xl">
            {{ $t("page.settings.notifications.list_title") }}
          </h2>
          <p class="text-dimmed text-base sm:text-sm">
            {{ $t("page.settings.notifications.list_description") }}
          </p>
        </div>

        <div class="flex gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-ph-checks"
            :disabled="!hasNotifications"
            :loading="isMarkingAllRead"
            @click="handleMarkAllAsRead"
          >
            {{ $t("page.settings.notifications.mark_all_read") }}
          </UButton>
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-ph-broom"
            :disabled="!hasNotifications"
            :loading="isDeletingAll"
            @click="handleDeleteAll"
          >
            {{ $t("page.settings.notifications.delete_all") }}
          </UButton>
        </div>
      </div>
    </section>

    <div>
      <UEmpty
        v-if="notifications.length === 0"
        icon="i-ph-bell-slash"
        :title="$t('page.settings.notifications.no_notifications')"
      />

      <NotificationCard
        v-for="notification in notifications"
        :key="notification._id"
        :clickable="true"
        :dimmed="notification.isRead"
        mode="list"
        actions-on-hover
        @click="handleNotificationClick(notification)"
      >
        <template #icon>
          <div class="relative">
            <div
              v-if="!notification.isRead"
              class="bg-primary absolute top-4 -left-4 size-2 rounded-full"
            />
            <div
              :class="[
                'flex size-10 items-center justify-center rounded-lg',
                notification.isRead ? 'bg-accented' : 'bg-primary/10',
              ]"
            >
              <UIcon
                :name="notification.icon"
                :class="[
                  'size-5',
                  notification.isRead ? 'text-muted' : 'text-primary',
                ]"
              />
            </div>
          </div>
        </template>

        <template #title>
          <div class="text-highlighted mb-1 text-sm font-medium">
            {{ processI18n(notification.title, notification.params) }}
          </div>
        </template>

        <template #description>
          <div class="text-dimmed text-xs">
            {{ processI18n(notification.description, notification.params) }}
          </div>
        </template>

        <template #meta>
          <span class="text-muted text-xs whitespace-nowrap">
            {{ formatRelativeTime(notification.createdAt, t, locale) }}
          </span>
        </template>

        <template #actions>
          <div class="flex min-w-14 items-center justify-end gap-1">
            <UButton
              v-if="!notification.isRead"
              icon="i-ph-check"
              variant="ghost"
              color="neutral"
              size="xs"
              @click="
                (event: Event) =>
                  handleMarkAsReadSingle(notification._id, event)
              "
            />
            <UButton
              icon="i-ph-broom"
              variant="ghost"
              color="neutral"
              size="xs"
              @click="(event: Event) => handleDelete(notification._id, event)"
            />
          </div>
        </template>
      </NotificationCard>

      <div
        v-if="hasMore"
        ref="sentinel"
        class="flex h-4 items-center justify-center"
      >
        <UIcon
          v-if="isLoadingMore"
          name="i-ph-spinner"
          class="size-4 animate-spin"
        />
      </div>
    </div>
  </div>
</template>
