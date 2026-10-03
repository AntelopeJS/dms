<script setup lang="ts">
import { refDebounced } from "@vueuse/core";
import { formatRelativeTime } from "#dms-core/app/utils/formatter";
import { useNotificationCatalog } from "../../../../../composables/notification/useNotificationCatalog";
import type {
  InboxApiFilter,
  InboxFilters,
} from "../../../../../composables/notification/inboxFilters";
import {
  DEFAULT_INBOX_FILTERS,
  buildInboxUrl,
  cleanSearch,
  fromCategoryValue,
  hasActiveInboxFilters,
  matchMessageKeys,
  readInboxFilters,
  toCategoryValue,
} from "../../../../../composables/notification/inboxFilters";
import type { UserNotification } from "../../../../../composables/notification/useNotifications";
import NotificationInboxItem from "./NotificationInboxItem.vue";
import NotificationInboxToolbar, {
  type InboxCategoryItem,
} from "./NotificationInboxToolbar.vue";
import {
  type NotificationSourceTag,
  formatNotificationTime,
  groupNotificationsByDay,
} from "./notificationDisplay";

const UNDO_TOAST_DURATION_MS = 6000;
const SEARCH_DEBOUNCE_MS = 300;
const PLURAL_SAMPLE = 2;
const SUBJECT_ITEM_CLASS = "ps-8";

const { t, locale } = useI18n();
const toast = useToast();
const { confirm } = useConfirm();
const route = useDmsRoute();
const catalog = useNotificationCatalog();
const {
  inboxItems,
  inboxHasMore,
  inboxCounts,
  inboxFacets,
  fetchInbox,
  fetchInboxFacets,
  setInboxFilter,
  resetInboxFilter,
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

// The filters live in the URL query, so a reload or a shared link keeps them.
const initialFilters = readInboxFilters(route.query);
const searchText = ref(initialFilters.q);
const debouncedSearch = refDebounced(searchText, SEARCH_DEBOUNCE_MS);
const filters = reactive<InboxFilters>({ ...initialFilters });

const { isLoadingMore, setupObserver } = useInfiniteScroll(
  sentinel,
  () => fetchInbox(),
  inboxHasMore,
);

/** A message key as it reads in the active locale, placeholders left empty. */
const translateKey = (key: string) => [t(key, {}), t(key, {}, PLURAL_SAMPLE)];

const matchingKeys = computed(() =>
  // Read the locale so a language switch matches the new texts.
  locale.value && filters.q
    ? matchMessageKeys(inboxFacets.value.messageKeys, translateKey, filters.q)
    : [],
);

const apiFilter = computed<InboxApiFilter>(() => ({
  q: filters.q,
  keys: matchingKeys.value,
  category: filters.category,
  subject: filters.subject,
  status: filters.status,
}));

const isFiltered = computed(() => hasActiveInboxFilters(filters));

const categoryValue = computed({
  get: () => toCategoryValue(filters.category, filters.subject),
  set: (value: string) => Object.assign(filters, fromCategoryValue(value)),
});

const hasSubjectFacet = (categoryId: string, subjectId: string) =>
  inboxFacets.value.subjects.some(
    (facet) => facet.categoryId === categoryId && facet.subjectId === subjectId,
  );

/**
 * "All categories", then the categories the user has notifications in,
 * labelled as in the preferences above. A category's subjects follow it when
 * it holds more than one; the selected one always shows.
 */
const categoryItems = computed<InboxCategoryItem[][]>(() => {
  const groups = catalog.categories.value
    .map((category) => {
      const subjects = catalog
        .subjectsOf(category.id)
        .filter(
          (subject) =>
            hasSubjectFacet(category.id, subject.id) ||
            (filters.category === category.id &&
              filters.subject === subject.id),
        );
      const isPresent = subjects.length > 0 || filters.category === category.id;
      const listed =
        subjects.length > 1 || filters.subject ? subjects : ([] as never[]);
      return isPresent
        ? [
            {
              label: t(category.labelKey),
              value: category.id,
              icon: category.icon,
            },
            ...listed.map((subject) => ({
              label: t(subject.labelKey),
              value: toCategoryValue(category.id, subject.id),
              class: SUBJECT_ITEM_CLASS,
            })),
          ]
        : [];
    })
    .filter((group) => group.length > 0);
  return [
    [
      {
        label: t("page.settings.notifications.category_all"),
        value: toCategoryValue("", ""),
        icon: "i-ph-squares-four",
      },
    ],
    ...groups,
  ];
});

const shownCount = computed(() => {
  const { all, unread } = inboxCounts.value;
  if (filters.status === "unread") return unread;
  if (filters.status === "read") return Math.max(all - unread, 0);
  return all;
});
const markableCount = computed(() =>
  filters.status === "read" ? 0 : inboxCounts.value.unread,
);

const groups = computed(() => groupNotificationsByDay(inboxItems.value));
const remainingCount = computed(() =>
  Math.max(shownCount.value - inboxItems.value.length, 0),
);

const noMatchTitle = computed(() =>
  filters.q
    ? t("page.settings.notifications.no_match_title_query", {
        query: filters.q,
      })
    : t("page.settings.notifications.no_match_title"),
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

const clearFilters = () => {
  searchText.value = "";
  Object.assign(filters, DEFAULT_INBOX_FILTERS);
};

/** The bulk actions act on what the filters show, or on everything. */
const bulkFilter = () => (isFiltered.value ? apiFilter.value : undefined);

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
    const ids = await markAllAsRead(bulkFilter());
    if (ids.length > 0) offerUndo(ids);
  } catch {
    notifyFailure();
  } finally {
    isMarkingAllRead.value = false;
  }
};

const deleteAllText = () => {
  const total = shownCount.value;
  const unread = markableCount.value;
  if (isFiltered.value) {
    return {
      title: t(
        "page.settings.notifications.delete_matching_title",
        { count: total },
        total,
      ),
      description: t("page.settings.notifications.delete_matching_description"),
    };
  }
  return {
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
  };
};

// v2 .modal.confirm; a failure is toasted and the dialog stays open.
const confirmDeleteAll = () => {
  const total = shownCount.value;
  return confirm({
    ...deleteAllText(),
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
        await deleteAll(bulkFilter());
        void runSafely(fetchInboxFacets);
        return true;
      } catch {
        notifyFailure();
        return false;
      }
    },
  });
};

/** Keeps the filters in the URL without a server round trip. */
const syncUrl = (next: InboxFilters) => {
  const { pathname, search, hash } = window.location;
  const url = buildInboxUrl(window.location, next);
  if (url !== `${pathname}${search}${hash}`)
    window.history.replaceState(window.history.state, "", url);
};

// Once the inbox has loaded, a filter change (typing, a select, new keys
// after a language switch) reloads it; the same filter twice does not.
watch(
  () => JSON.stringify(apiFilter.value),
  () => {
    if (isLoaded.value) void runSafely(() => setInboxFilter(apiFilter.value));
  },
);
watch(filters, syncUrl, { deep: true });

watch(debouncedSearch, (text) => {
  filters.q = cleanSearch(text);
});

watch(sentinel, (element) => {
  if (element) setupObserver();
});

onMounted(async () => {
  await runSafely(() =>
    Promise.all([
      fetchInboxFacets(),
      catalog.isLoaded.value ? undefined : catalog.loadCatalog(),
    ]),
  );
  await runSafely(() => setInboxFilter(apiFilter.value));
  isLoaded.value = true;
});

// The bell's counts stop following the inbox filter once it is gone.
onBeforeUnmount(resetInboxFilter);
</script>

<template>
  <DmsSection
    :title="t('page.settings.notifications.inbox_title')"
    :description="t('page.settings.notifications.inbox_description')"
  >
    <NotificationInboxToolbar
      v-model:search="searchText"
      v-model:category="categoryValue"
      v-model:status="filters.status"
      :counts="inboxCounts"
      :category-items="categoryItems"
      :is-filtered="isFiltered"
      :shown-count="shownCount"
      :unread-count="markableCount"
      :is-marking-all-read="isMarkingAllRead"
      :hide-summary="isLoaded && inboxItems.length === 0"
      :loading="!isLoaded"
      @mark-all-read="handleMarkAllAsRead"
      @delete-all="confirmDeleteAll"
      @clear-filters="clearFilters"
    />

    <div v-if="!isLoaded" class="space-y-4 px-[18px] py-5">
      <div v-for="row in 3" :key="row" class="flex items-start gap-3">
        <USkeleton class="size-[34px] rounded-[9px]" />
        <div class="flex-1 space-y-1.5">
          <USkeleton class="h-3 w-56 max-w-full" />
          <USkeleton class="h-2.5 w-80 max-w-full" />
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
      v-else-if="isFiltered"
      variant="no-result"
      :title="noMatchTitle"
      :description="t('page.settings.notifications.no_match_description')"
      :actions="[
        {
          label: t('page.settings.notifications.clear_filters'),
          icon: 'i-ph-x',
          color: 'neutral',
          variant: 'outline',
          size: 'sm',
          onClick: clearFilters,
        },
      ]"
    />

    <DmsEmptyState
      v-else
      icon="i-ph-bell-slash"
      :title="t('page.settings.notifications.empty_title')"
      :description="t('page.settings.notifications.empty_description')"
    />

    <template v-if="isLoaded && inboxHasMore && inboxItems.length > 0" #footer>
      <div ref="sentinel" class="flex w-full justify-center">
        <!-- The next page on its way: a placeholder the size of the button. -->
        <USkeleton
          v-if="isLoadingMore"
          :aria-label="
            t('page.settings.notifications.loading_more', {
              count: remainingCount,
            })
          "
          role="status"
          class="h-6 w-40"
        />
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
