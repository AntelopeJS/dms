<script setup lang="ts">
import DmsSegmented from "#dms-ui/app/components/segmented/Segmented.vue";
import {
  buildPageSearchShortcuts,
  PAGE_SEARCH_HINT_KEYS,
  pageSearchAriaKeyshortcuts,
} from "#dms-ui/app/composables/global/searchShortcuts";
import {
  keyboardKeyLabel,
  useKeyboardPlatform,
} from "#dms-ui/app/composables/global/keyboardPlatform";
import {
  INBOX_SEARCH_MAX_LENGTH,
  type InboxReadState,
} from "../../../../../composables/notification/inboxFilters";
import type { NotificationCounts } from "../../../../../composables/notification/useNotifications";

/** One entry of the category select: a category, or one of its subjects. */
export interface InboxCategoryItem {
  label: string;
  value: string;
  icon?: string;
  class?: string;
}

interface NotificationInboxToolbarProps {
  /** Totals of the feed the search and category narrow. */
  counts: NotificationCounts;
  /** "All categories" first, then one group per category. */
  categoryItems: InboxCategoryItem[][];
  /** A filter is on: the actions act on the matching notifications only. */
  isFiltered: boolean;
  /** Notifications the current view holds (its read state included). */
  shownCount: number;
  /** Unread notifications "Mark as read" would change. */
  unreadCount: number;
  isMarkingAllRead: boolean;
  /** Drops the results row: the inbox below says it is empty. */
  hideSummary?: boolean;
  /**
   * The first page is still on its way: counts are unknown, so the read
   * state shows no counter and the results row holds a placeholder rather
   * than a "0 results" that would flash before the real figure.
   */
  loading?: boolean;
}

const props = defineProps<NotificationInboxToolbarProps>();
const search = defineModel<string>("search", { required: true });
const category = defineModel<string>("category", { required: true });
const status = defineModel<InboxReadState>("status", { required: true });
const emit = defineEmits<{
  markAllRead: [];
  deleteAll: [];
  clearFilters: [];
}>();

// Phones: icon-only actions, the label stays the accessible name.
const PHONE_ICON_ONLY_UI = { label: "max-sm:sr-only" } as const;
// v2 .cs-dev__tools: the filter strip at the top of a card.
const STRIP_CLASS =
  "border-default flex flex-wrap items-center gap-2 border-b bg-(--dms-bg-muted) py-2.5 ps-[18px] pe-3.5";

const { t } = useI18n();
const { platform, isMac } = useKeyboardPlatform();

const statusItems = computed(() => [
  {
    value: "all",
    label: t("page.settings.notifications.tab_all"),
    count: props.loading ? undefined : props.counts.all,
  },
  {
    value: "unread",
    label: t("page.settings.notifications.tab_unread"),
    count: props.loading ? undefined : props.counts.unread,
  },
  {
    value: "read",
    label: t("page.settings.notifications.tab_read"),
    count: props.loading
      ? undefined
      : Math.max(props.counts.all - props.counts.unread, 0),
  },
]);

const statusModel = computed({
  get: () => status.value,
  set: (value: string | number | undefined) => {
    if (value !== undefined) status.value = value as InboxReadState;
  },
});

const summary = computed(() =>
  props.isFiltered
    ? t(
        "page.settings.notifications.result_matching",
        { count: props.shownCount },
        props.shownCount,
      )
    : t(
        "page.settings.notifications.result_count",
        { count: props.shownCount },
        props.shownCount,
      ),
);
// Filtered, the actions name how many results they change ("Mark 4 as
// read"); otherwise they say "all".
const markLabel = computed(() =>
  props.isFiltered
    ? t(
        "page.settings.notifications.mark_matching_read",
        { count: props.unreadCount },
        props.unreadCount,
      )
    : t("page.settings.notifications.mark_all_read"),
);
const deleteLabel = computed(() =>
  props.isFiltered
    ? t(
        "page.settings.notifications.delete_matching",
        { count: props.shownCount },
        props.shownCount,
      )
    : t("page.settings.notifications.delete_all"),
);

// "/" belongs to the settings menu search; the page's own search takes
// ⌘ / or Ctrl / (as on the Shortcuts page).
const searchInput = useTemplateRef<{ inputRef?: HTMLInputElement }>("search");
const focusSearch = () => searchInput.value?.inputRef?.focus();
defineShortcuts(buildPageSearchShortcuts(focusSearch));
const searchHintKeys = computed(() =>
  PAGE_SEARCH_HINT_KEYS.map((key) => keyboardKeyLabel(key, platform.value)),
);

const clearSearch = () => {
  search.value = "";
  focusSearch();
};

const onSearchKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || !search.value) return;
  event.stopPropagation();
  search.value = "";
};
</script>

<template>
  <div :class="STRIP_CLASS" role="search">
    <UInput
      ref="search"
      v-model="search"
      type="search"
      icon="i-ph-magnifying-glass"
      :placeholder="t('page.settings.notifications.search_short')"
      :aria-label="t('page.settings.notifications.search_placeholder')"
      :aria-keyshortcuts="pageSearchAriaKeyshortcuts(isMac)"
      :maxlength="INBOX_SEARCH_MAX_LENGTH"
      autocomplete="off"
      class="min-w-0 basis-full sm:flex-1 sm:basis-40"
      :ui="{ base: '[&::-webkit-search-cancel-button]:appearance-none' }"
      @keydown="onSearchKeydown"
    >
      <template #trailing>
        <UButton
          v-if="search"
          color="neutral"
          variant="link"
          size="sm"
          icon="i-ph-x-circle-fill"
          class="text-dimmed hover:text-highlighted -me-1 p-1"
          :aria-label="t('page.settings.notifications.search_clear')"
          :title="t('page.settings.notifications.search_clear')"
          @click="clearSearch"
        />
        <!-- No key hint on phones: it covered the placeholder there. -->
        <span v-else class="flex items-center gap-0.5 max-sm:hidden">
          <UKbd
            v-for="key in searchHintKeys"
            :key="key"
            :value="key"
            size="sm"
          />
        </span>
      </template>
    </UInput>
    <USelect
      v-model="category"
      :items="props.categoryItems"
      :aria-label="t('page.settings.notifications.category_label')"
      :content="{ align: 'start' }"
      icon="i-ph-funnel-simple"
      class="min-w-0 max-sm:basis-full sm:w-[208px]"
      :ui="{ content: 'min-w-fit' }"
    />
    <!-- Phones: the read states share a full-width row. -->
    <DmsSegmented
      v-model="statusModel"
      :items="statusItems"
      size="md"
      block
      class="sm:inline-flex sm:w-auto max-sm:[&>button]:gap-1 max-sm:[&>button]:px-1.5"
      :aria-label="t('page.settings.notifications.status_label')"
    />
  </div>
  <div
    v-if="!props.hideSummary"
    class="border-muted flex min-h-10 flex-wrap items-center gap-x-2 border-b py-1 ps-[18px] pe-3.5"
  >
    <USkeleton
      v-if="props.loading"
      class="h-3 w-24 bg-(--dms-skeleton)"
      aria-hidden="true"
    />
    <p v-else class="text-muted text-xs tabular-nums" aria-live="polite">
      {{ summary }}
    </p>
    <UButton
      v-if="props.isFiltered && !props.loading"
      color="neutral"
      variant="link"
      size="xs"
      class="shrink-0 px-0"
      :label="t('page.settings.notifications.clear_filters')"
      @click="emit('clearFilters')"
    />
    <div v-if="!props.loading" class="ms-auto flex shrink-0 items-center gap-1">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-ph-checks"
        class="max-sm:size-8 max-sm:justify-center"
        :ui="PHONE_ICON_ONLY_UI"
        :title="markLabel"
        :label="markLabel"
        v-if="!props.isFiltered || props.unreadCount > 0"
        :disabled="props.unreadCount === 0"
        :loading="props.isMarkingAllRead"
        @click="emit('markAllRead')"
      />
      <UButton
        v-if="props.shownCount > 0"
        color="error"
        variant="ghost"
        size="sm"
        icon="i-ph-trash"
        class="max-sm:size-8 max-sm:justify-center"
        :ui="PHONE_ICON_ONLY_UI"
        :title="deleteLabel"
        :label="deleteLabel"
        @click="emit('deleteAll')"
      />
    </div>
  </div>
</template>
