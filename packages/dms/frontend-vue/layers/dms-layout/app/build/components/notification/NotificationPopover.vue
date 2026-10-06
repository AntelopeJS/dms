<script setup lang="ts">
import { formatRelativeTime } from "#dms-core/app/utils/formatter";
import NotificationCard from "./NotificationCard.vue";
import { useNavBadges } from "#dms-ui/app/composables/navigation/useNavBadges";
import { settleWidgetRequest } from "./widgetRequest";
import type { UserNotification } from "../../../composables/notification/useNotifications";
import { resolveNotificationTone } from "../pages/settings/notification/notificationDisplay";

const MAX_DISPLAYED_COUNT = 99;
// Placeholder rows while the list loads: enough to fill the list's height.
const SKELETON_ROW_COUNT = 4;
const NOTIFICATIONS_SETTINGS_PAGE = "settings.user.notifications";

const { t, locale } = useI18n();
const { loggedIn } = useUserSession();
const { processI18n } = useTranslation();
const {
  unreadCount,
  unseenCount,
  notifications,
  hasMore,
  fetchBellCounts,
  fetchNotifications,
  markAsRead,
  markAllSeen,
} = useNotifications();
const { setNavBadge } = useNavBadges();
const isOpen = ref(false);
const sentinel = ref<HTMLElement | null>(null);
// Each opening reloads the list from its first page: until it answers, the
// popover shows placeholder rows, never "No notifications".
const isListLoading = ref(false);

const { isLoadingMore, setupObserver, disconnectObserver } = useInfiniteScroll(
  sentinel,
  () => fetchNotifications(),
  hasMore,
);

// The sender's tone (a warning, a success) colours the icon well, as in the
// inbox; untoned notifications keep the accent until read.
const iconWellTone = (notification: UserNotification) => {
  const tone = resolveNotificationTone(notification);
  return tone === "neutral" ? "muted" : tone;
};

const formatCount = (count: number) =>
  count > MAX_DISPLAYED_COUNT ? `${MAX_DISPLAYED_COUNT}+` : String(count);

// The bell's badge counts what arrived since it was last opened (unseen);
// opening it resets the badge but leaves the notifications unread.
const displayedCount = computed(() => formatCount(unseenCount.value));

// The bell is on every page, so it keeps the unread badge of the
// Notifications entry in the navigation current between two menu loads:
// that one counts what is still unread, seen or not.
watch(unreadCount, (count) => {
  setNavBadge(NOTIFICATIONS_SETTINGS_PAGE, count > 0 ? formatCount(count) : "");
});

const refreshCounts = () =>
  settleWidgetRequest(fetchBellCounts, () => {
    unreadCount.value = 0;
    unseenCount.value = 0;
  });

const handleNotificationEvent = async () => {
  if (!isOpen.value) {
    await refreshCounts();
  }
};

const handleFormSubmitSuccess = async (event: Event) => {
  const customEvent = event as CustomEvent;
  const submitUrl = customEvent.detail?.data?.submitUrl;

  if (submitUrl && submitUrl.includes("/api/notification/")) {
    if (!isOpen.value) {
      await refreshCounts();
    }
  }
};

// Seeing is not reading: the notifications stay unread until opened or
// marked read, in the popover or the inbox.
const markSeen = async () => {
  if (unseenCount.value > 0) await settleWidgetRequest(markAllSeen);
};

onMounted(async () => {
  if (!loggedIn.value) return;
  await refreshCounts();

  window.addEventListener(
    NotificationEvents.NOTIFICATION_RECEIVED,
    handleNotificationEvent as EventListener,
  );
  window.addEventListener(
    FormEvents.SUBMIT_SUCCESS,
    handleFormSubmitSuccess as EventListener,
  );
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
});

watch(isOpen, async (isNowOpen) => {
  if (isNowOpen) {
    isListLoading.value = true;
    await Promise.all([
      markSeen(),
      settleWidgetRequest(() => fetchNotifications(true)),
    ]);
    isListLoading.value = false;
    await nextTick();
    setupObserver();
  } else {
    disconnectObserver();
    // What arrived while the list was open showed at its top: seen too.
    await markSeen();
  }
});

const handleNotificationClick = async (notification: UserNotification) => {
  isOpen.value = false;
  if (!notification.isRead) {
    await settleWidgetRequest(() => markAsRead(notification._id));
  }
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
        <!-- Floats over the button's corner (nothing moves) and fades in
             (starting style) once the count, fetched after mount, is back. -->
        <span
          v-if="unseenCount > 0"
          class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--dms-accent-fill) px-1 text-[10px] leading-none font-semibold text-(--dms-accent-on-fill) ring-2 ring-(--ui-bg-muted) transition-opacity duration-200 starting:opacity-0"
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
          v-if="isListLoading && notifications.length === 0"
          aria-hidden="true"
          class="-mr-2 -ml-2 max-h-96 overflow-hidden"
        >
          <div
            v-for="n in SKELETON_ROW_COUNT"
            :key="n"
            class="flex items-start gap-3 p-4"
          >
            <USkeleton class="size-10 shrink-0 rounded-[10px]" />
            <div class="min-w-0 flex-1">
              <div class="mb-0.5 text-xs">
                <USkeleton class="inline-block h-2.5 w-2/5 align-middle" />
              </div>
              <div class="text-xs">
                <USkeleton class="inline-block h-2 w-11/12 align-middle" />
              </div>
              <div class="text-xs">
                <USkeleton class="inline-block h-2 w-3/5 align-middle" />
              </div>
              <div class="mt-1 text-[10px]">
                <USkeleton class="inline-block h-2 w-14 align-middle" />
              </div>
            </div>
          </div>
        </div>

        <div
          v-else-if="notifications.length === 0"
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
              <DmsIconWell
                :icon="notification.icon"
                :tone="iconWellTone(notification)"
                size="xl"
              />
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

          <div v-if="hasMore" ref="sentinel" class="min-h-4">
            <div
              v-if="isLoadingMore"
              aria-hidden="true"
              class="flex items-start gap-3 p-4"
            >
              <USkeleton class="size-10 shrink-0 rounded-[10px]" />
              <div class="min-w-0 flex-1 space-y-2 pt-1">
                <USkeleton class="h-2.5 w-2/5" />
                <USkeleton class="h-2 w-4/5" />
              </div>
            </div>
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
