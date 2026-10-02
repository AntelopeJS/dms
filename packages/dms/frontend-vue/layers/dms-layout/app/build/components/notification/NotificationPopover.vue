<script setup lang="ts">
import { formatRelativeTime } from "#dms-core/app/utils/formatter";
import NotificationCard from "./NotificationCard.vue";
import { useSettingsNavTrails } from "../../../composables/settings/useSettingsNavTrails";
import { settleWidgetRequest } from "./widgetRequest";

const MAX_DISPLAYED_COUNT = 99;
const NOTIFICATIONS_SETTINGS_PAGE = "settings.user.notifications";

const { t, locale } = useI18n();
const { loggedIn } = useUserSession();
const { processI18n } = useTranslation();
const {
  unreadCount,
  notifications,
  hasMore,
  fetchUnreadCount,
  fetchNotifications,
  markAllAsRead,
} = useNotifications();
const { setTrail, clearTrail } = useSettingsNavTrails();
const isOpen = ref(false);
const sentinel = ref<HTMLElement | null>(null);
const hasBeenOpened = ref(false);

const { isLoadingMore, setupObserver, disconnectObserver } = useInfiniteScroll(
  sentinel,
  () => fetchNotifications(),
  hasMore,
);

const displayedCount = computed(() =>
  unreadCount.value > MAX_DISPLAYED_COUNT
    ? `${MAX_DISPLAYED_COUNT}+`
    : String(unreadCount.value),
);

// The bell is on every page, so it keeps the unread badge of the
// Notifications entry in the settings navigation current.
watch(
  unreadCount,
  (count) => {
    if (count === 0) {
      clearTrail(NOTIFICATIONS_SETTINGS_PAGE);
      return;
    }
    setTrail({
      fullId: NOTIFICATIONS_SETTINGS_PAGE,
      badge: displayedCount.value,
      label: t("page.settings.notifications.unread_badge", { count }, count),
    });
  },
  { immediate: true },
);

const refreshUnreadCount = () =>
  settleWidgetRequest(fetchUnreadCount, () => {
    unreadCount.value = 0;
  });

const handleNotificationEvent = async () => {
  if (!isOpen.value) {
    await refreshUnreadCount();
  }
};

const handleFormSubmitSuccess = async (event: Event) => {
  const customEvent = event as CustomEvent;
  const submitUrl = customEvent.detail?.data?.submitUrl;

  if (submitUrl && submitUrl.includes("/api/notification/")) {
    if (!isOpen.value) {
      await refreshUnreadCount();
    }
  }
};

const markNotificationsAsRead = async () => {
  if (hasBeenOpened.value) {
    await settleWidgetRequest(markAllAsRead);
    hasBeenOpened.value = false;
  }
};

const handleBeforeUnload = () => {
  if (hasBeenOpened.value) {
    navigator.sendBeacon("/api/settings/user/notifications/mark-all-read");
  }
};

onMounted(async () => {
  if (!loggedIn.value) return;
  await refreshUnreadCount();

  window.addEventListener(
    NotificationEvents.NOTIFICATION_RECEIVED,
    handleNotificationEvent as EventListener,
  );
  window.addEventListener(
    FormEvents.SUBMIT_SUCCESS,
    handleFormSubmitSuccess as EventListener,
  );
  window.addEventListener("beforeunload", handleBeforeUnload);
});

onUnmounted(() => {
  disconnectObserver();

  window.removeEventListener(
    NotificationEvents.NOTIFICATION_RECEIVED,
    handleNotificationEvent as EventListener,
  );
  window.removeEventListener(
    FormEvents.SUBMIT_SUCCESS,
    handleFormSubmitSuccess as EventListener,
  );
  window.removeEventListener("beforeunload", handleBeforeUnload);
});

watch(isOpen, async (isNowOpen) => {
  if (isNowOpen) {
    hasBeenOpened.value = true;
    await settleWidgetRequest(() => fetchNotifications(true));
    await nextTick();
    setupObserver();
  } else {
    disconnectObserver();
    await markNotificationsAsRead();
  }
});

const handleNotificationClick = async (notification: UserNotification) => {
  isOpen.value = false;
  if (notification.linkTo) {
    await navigateDms(notification.linkTo);
  }
};

const goToNotifications = () => {
  isOpen.value = false;
  navigateDms("/settings/user/notifications");
};
</script>

<template>
  <UPopover
    v-model:open="isOpen"
    :ui="{ content: 'w-[460px] max-w-[calc(100vw-1rem)]' }"
    :content="{ align: 'end', collisionPadding: 8 }"
  >
    <UTooltip
      :text="$t('notification.dropdown.title')"
      :content="{ side: 'bottom', sideOffset: 6 }"
    >
      <UButton
        icon="i-ph-bell-light"
        :aria-label="$t('notification.dropdown.title')"
        variant="ghost"
        color="neutral"
        class="text-muted hover:text-highlighted data-[state=open]:text-highlighted relative"
        :ui="{ leadingIcon: 'size-[18px]' }"
      >
        <span
          v-if="unreadCount > 0"
          class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--dms-accent-fill) px-1 text-[10px] leading-none font-semibold text-(--dms-accent-on-fill) ring-2 ring-(--ui-bg-muted)"
        >
          {{ displayedCount }}
        </span>
      </UButton>
    </UTooltip>

    <template #content>
      <div class="p-4">
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-highlighted text-sm font-semibold">
            {{ $t("notification.dropdown.title") }}
          </h3>
        </div>

        <USeparator class="-mx-4 mt-2 w-[calc(100%+2rem)]" />

        <div
          v-if="notifications.length === 0"
          class="text-dimmed py-6 text-center text-sm"
        >
          {{ $t("notification.dropdown.no_notifications") }}
        </div>

        <div
          v-else
          class="-mr-2 -ml-2 max-h-96 [scrollbar-width:none] overflow-y-auto [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <NotificationCard
            v-for="notification in notifications"
            :key="notification._id"
            :clickable="true"
            mode="borderless"
            @click="handleNotificationClick(notification)"
          >
            <template #icon>
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
            </template>

            <template #title>
              <div class="text-highlighted mb-0.5 text-xs font-medium">
                {{ processI18n(notification.title ?? "", notification.params) }}
              </div>
            </template>

            <template #description>
              <div class="text-dimmed line-clamp-2 text-xs">
                {{
                  processI18n(
                    notification.description ?? "",
                    notification.params,
                  )
                }}
              </div>
              <div class="text-muted mt-1 text-[10px]">
                {{ formatRelativeTime(notification.createdAt, t, locale) }}
              </div>
            </template>

            <template #meta>
              <div
                v-if="!notification.isRead"
                class="bg-primary size-2 rounded-full"
              />
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

        <USeparator class="-mx-4 mb-2 w-[calc(100%+2rem)]" />

        <UButton
          :label="$t('notification.dropdown.view_all')"
          variant="ghost"
          color="neutral"
          block
          class="-mb-2"
          @click="goToNotifications"
        />
      </div>
    </template>
  </UPopover>
</template>
