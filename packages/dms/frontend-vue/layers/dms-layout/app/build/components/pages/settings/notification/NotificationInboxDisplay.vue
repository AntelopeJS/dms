<script setup lang="ts">
import { formatRelativeTime } from "#dms-core/app/utils/formatter";
import TableEmpty from "#dms-ui/app/build/components/table/Empty.vue";
import TablePagination from "#dms-ui/app/build/components/table/Pagination.vue";
import type { TableViewDisplayContext } from "#dms-ui/app/composables/table-view/types/display";
import { useNotificationCatalog } from "../../../../../composables/notification/useNotificationCatalog";
import {
  type UserNotification,
  useNotifications,
} from "../../../../../composables/notification/useNotifications";
import NotificationInboxItem from "./NotificationInboxItem.vue";
import {
  formatNotificationTime,
  groupNotificationsByDay,
  type NotificationSourceTag,
} from "./notificationDisplay";

// The `dms:inbox` display of the notifications page's table: the user's feed
// as v2 inbox rows under day headings. The table brings the tabs, the
// buttons, the empty states and the infinite pagination.

interface NotificationInboxDisplayProps {
  context: TableViewDisplayContext<UserNotification>;
}

const props = defineProps<NotificationInboxDisplayProps>();

const SKELETON_ROWS = 3;

const { t, locale } = useI18n();
const toast = useToast();
const catalog = useNotificationCatalog();
const {
  unreadCount,
  notifications,
  markAsRead,
  markAsUnread,
  deleteNotification,
} = useNotifications();

const groups = computed(() => groupNotificationsByDay(props.context.items));
const isFirstLoad = computed(
  () => props.context.loading && props.context.items.length === 0,
);

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

// A change of a row is listed again, from the server.
const runThenRefresh = async (action: () => Promise<unknown>) => {
  try {
    await action();
  } catch {
    toast.add({ title: t("dms.form.error_title"), color: "error" });
  }
  await props.context.refresh();
};

const openNotification = async (notification: UserNotification) => {
  if (!notification.isRead) {
    await runThenRefresh(() => markAsRead(notification._id));
  }
  if (notification.linkTo) await navigateDms(notification.linkTo);
};

const toggleRead = (notification: UserNotification) =>
  runThenRefresh(() =>
    notification.isRead
      ? markAsUnread(notification._id)
      : markAsRead(notification._id),
  );

// What the stream changes elsewhere (a notification arriving, read in
// another tab) is listed again here.
watch(
  () => [unreadCount.value, notifications.value[0]?._id],
  () => void props.context.refresh(),
);

onMounted(() => {
  if (!catalog.isLoaded.value) void catalog.loadCatalog();
});
</script>

<template>
  <div>
    <div v-if="isFirstLoad" class="space-y-4 px-[18px] py-5">
      <DmsRowSkeleton
        v-for="row in SKELETON_ROWS"
        :key="row"
        well="size-[34px] rounded-[9px]"
        :lines="['h-3 w-56 max-w-full', 'h-2.5 w-80 max-w-full']"
      />
    </div>

    <template v-else-if="context.items.length > 0">
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
          @delete="runThenRefresh(() => deleteNotification(notification._id))"
        />
      </section>
    </template>

    <TableEmpty v-else />

    <TablePagination />
  </div>
</template>
