<script setup lang="ts">
import { formatRelativeTime } from "#dms-core/app/utils/formatter";
import { useNotificationCatalog } from "../../../../../composables/notification/useNotificationCatalog";
import type {
  NotificationInboxFilter,
  UserNotification,
} from "../../../../../composables/notification/useNotifications";
import NotificationInboxItem from "./NotificationInboxItem.vue";
import {
  type NotificationSourceTag,
  formatNotificationTime,
  groupNotificationsByDay,
} from "./notificationDisplay";

interface InboxTab {
  id: NotificationInboxFilter;
  label: string;
  count: number;
}

const UNDO_TOAST_DURATION_MS = 6000;
// The toolbar actions keep their label for screen readers only under `sm`.
const PHONE_ICON_ONLY_UI = { label: "max-sm:sr-only" } as const;

const { t, locale } = useI18n();
const toast = useToast();
const { confirm } = useConfirm();
const catalog = useNotificationCatalog();
const {
  inboxFilter,
  inboxItems,
  inboxHasMore,
  inboxCounts,
  fetchInbox,
  fetchCounts,
  setInboxFilter,
  markAsRead,
  markAsUnread,
  deleteNotification,
  markAllAsRead,
  undoMarkAllAsRead,
  deleteAll,
} = useNotifications();

const sentinel = ref<HTMLElement | null>(null);
const isLoaded = ref(false);
const isMarkingAllRead = ref(false);

const { isLoadingMore, setupObserver } = useInfiniteScroll(
  sentinel,
  () => fetchInbox(),
  inboxHasMore,
);

const tabs = computed<InboxTab[]>(() => [
  {
    id: "all",
    label: t("page.settings.notifications.tab_all"),
    count: inboxCounts.value.all,
  },
  {
    id: "unread",
    label: t("page.settings.notifications.tab_unread"),
    count: inboxCounts.value.unread,
  },
]);

const groups = computed(() => groupNotificationsByDay(inboxItems.value));
const remainingCount = computed(() => {
  const total =
    inboxFilter.value === "unread"
      ? inboxCounts.value.unread
      : inboxCounts.value.all;
  return Math.max(total - inboxItems.value.length, 0);
});

const timeOf = (notification: UserNotification) =>
  formatNotificationTime(notification.createdAt, locale.value, (date) =>
    formatRelativeTime(date, t, locale.value),
  );

/** A module's category tag wins; core notifications show their subject. */
const sourceOf = (
  notification: UserNotification,
): NotificationSourceTag | undefined => {
  const category = catalog.findCategory(notification.categoryId);
  if (category?.tagKey) return { label: t(category.tagKey), isModule: true };
  const subject = catalog.findSubject(
    notification.categoryId,
    notification.subjectId,
  );
  const labelKey = subject?.labelKey ?? category?.labelKey;
  return labelKey ? { label: t(labelKey), isModule: false } : undefined;
};

const notifyFailure = () =>
  toast.add({ title: t("dms.form.error_title"), color: "error" });

const runSafely = async (action: () => Promise<unknown>) => {
  try {
    await action();
  } catch {
    notifyFailure();
  }
};

const openNotification = async (notification: UserNotification) => {
  if (!notification.isRead) await runSafely(() => markAsRead(notification._id));
  if (notification.linkTo) await navigateDms(notification.linkTo);
};

const toggleRead = (notification: UserNotification) =>
  runSafely(() =>
    notification.isRead
      ? markAsUnread(notification._id)
      : markAsRead(notification._id),
  );

const selectTab = (filter: NotificationInboxFilter) =>
  runSafely(() => setInboxFilter(filter));

const offerUndo = (ids: string[]) => {
  toast.add({
    title: t(
      "page.settings.notifications.mark_all_read_toast",
      { count: ids.length },
      ids.length,
    ),
    icon: "i-ph-checks",
    duration: UNDO_TOAST_DURATION_MS,
    actions: [
      {
        label: t("page.settings.notifications.undo"),
        icon: "i-ph-arrow-counter-clockwise",
        color: "neutral",
        variant: "outline",
        size: "xs",
        onClick: () => runSafely(() => undoMarkAllAsRead(ids)),
      },
    ],
  });
};

const handleMarkAllAsRead = async () => {
  isMarkingAllRead.value = true;
  try {
    const ids = await markAllAsRead();
    if (ids.length > 0) offerUndo(ids);
  } catch {
    notifyFailure();
  } finally {
    isMarkingAllRead.value = false;
  }
};

// v2 .modal.confirm; a failure is toasted and the dialog stays open.
const confirmDeleteAll = () => {
  const total = inboxCounts.value.all;
  const unread = inboxCounts.value.unread;
  return confirm({
    title: t(
      "page.settings.notifications.delete_all_title",
      { count: total },
      total,
    ),
    description:
      unread > 0
        ? t(
            "page.settings.notifications.delete_all_description_unread",
            { count: unread },
            unread,
          )
        : t("page.settings.notifications.delete_all_description"),
    icon: "i-ph-trash",
    confirmColor: "error",
    confirmLabel: t(
      "page.settings.notifications.delete_all_confirm",
      { count: total },
      total,
    ),
    cancelLabel: t("page.settings.notifications.cancel"),
    onConfirm: async () => {
      try {
        await deleteAll();
        return true;
      } catch {
        notifyFailure();
        return false;
      }
    },
  });
};

watch(sentinel, (element) => {
  if (element) setupObserver();
});

onMounted(async () => {
  await runSafely(() =>
    Promise.all([
      fetchInbox(true),
      fetchCounts(),
      catalog.isLoaded.value ? undefined : catalog.loadCatalog(),
    ]),
  );
  isLoaded.value = true;
});
</script>

<template>
  <DmsSection
    :title="t('page.settings.notifications.inbox_title')"
    :description="t('page.settings.notifications.inbox_description')"
  >
    <div
      class="border-default flex items-center gap-2.5 border-b pr-3.5 pl-[18px]"
    >
      <nav
        class="flex gap-[18px]"
        role="tablist"
        :aria-label="t('page.settings.notifications.filter_label')"
      >
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="inboxFilter === tab.id"
          class="relative inline-flex h-[38px] items-center gap-1.5 px-0.5 text-[13px] transition-colors"
          :class="
            inboxFilter === tab.id
              ? 'text-highlighted after:bg-primary font-semibold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-t-[2px]'
              : 'text-muted hover:text-highlighted font-medium'
          "
          @click="selectTab(tab.id)"
        >
          {{ tab.label }}
          <span
            class="rounded-[4px] px-[5px] py-px font-mono text-[10.5px] font-semibold tabular-nums"
            :class="
              inboxFilter === tab.id
                ? 'text-primary bg-(--dms-accent-tint)'
                : 'bg-elevated text-dimmed'
            "
          >
            {{ tab.count }}
          </span>
        </button>
      </nav>
      <!-- Phones: icon-only actions (the label stays the accessible name and
           the tooltip) so they share the row with the tabs. -->
      <div class="ms-auto flex shrink-0 items-center gap-1.5">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-ph-checks"
          :ui="PHONE_ICON_ONLY_UI"
          :title="t('page.settings.notifications.mark_all_read')"
          :label="t('page.settings.notifications.mark_all_read')"
          :disabled="inboxCounts.unread === 0"
          :loading="isMarkingAllRead"
          @click="handleMarkAllAsRead"
        />
        <UButton
          v-if="inboxCounts.all > 0"
          color="error"
          variant="ghost"
          size="sm"
          icon="i-ph-trash"
          :ui="PHONE_ICON_ONLY_UI"
          :title="t('page.settings.notifications.delete_all')"
          :label="t('page.settings.notifications.delete_all')"
          @click="confirmDeleteAll"
        />
      </div>
    </div>

    <div v-if="!isLoaded" class="space-y-4 px-[18px] py-5">
      <div v-for="row in 3" :key="row" class="flex items-start gap-3">
        <USkeleton class="size-[34px] rounded-[9px]" />
        <div class="flex-1 space-y-1.5">
          <USkeleton class="h-3 w-56" />
          <USkeleton class="h-2.5 w-80" />
        </div>
      </div>
    </div>

    <template v-else-if="inboxItems.length > 0">
      <section v-for="(group, index) in groups" :key="group.key">
        <DmsEyebrow
          as="h3"
          class="border-muted bg-(--dms-bg-muted) pt-2 pr-[18px] pb-1.5 pl-[18px]"
          :class="{ 'border-t': index > 0 }"
          :label="t(`page.settings.notifications.day_${group.key}`)"
        />
        <NotificationInboxItem
          v-for="notification in group.items"
          :key="notification._id"
          :notification="notification"
          :time="timeOf(notification)"
          :source="sourceOf(notification)"
          @open="openNotification(notification)"
          @toggle-read="toggleRead(notification)"
          @delete="runSafely(() => deleteNotification(notification._id))"
        />
      </section>
    </template>

    <DmsEmptyState
      v-else
      icon="i-ph-bell-slash"
      :title="t('page.settings.notifications.empty_title')"
      :description="t('page.settings.notifications.empty_description')"
    />

    <template v-if="isLoaded && inboxHasMore && inboxItems.length > 0" #footer>
      <div ref="sentinel" class="flex w-full justify-center">
        <span
          v-if="isLoadingMore"
          class="text-muted inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium"
        >
          <UIcon name="i-ph-circle-notch" class="size-3 animate-spin" />
          {{
            t("page.settings.notifications.loading_more", {
              count: remainingCount,
            })
          }}
        </span>
        <UButton
          v-else
          color="neutral"
          variant="ghost"
          size="xs"
          :label="
            t('page.settings.notifications.load_more', {
              count: remainingCount,
            })
          "
          @click="runSafely(() => fetchInbox())"
        />
      </div>
    </template>
  </DmsSection>
</template>
