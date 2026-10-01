<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { usePermissionPreview } from "#dms-core/app/composables/auth/usePermissionPreview";
import { formatRelativeTime } from "#dms-core/app/utils/formatter";
import {
  type AccountActivityRow,
  translateActivityText,
} from "../../../../../composables/settings/activity/buildAccountActivity";
import { useAccountActivity } from "../../../../../composables/settings/activity/useAccountActivity";

const SKELETON_ROWS = 3;
const SKELETON_TITLE_WIDTHS = ["w-3/5", "w-1/2", "w-2/3"];
// Height of one feed row, DmsActivityItem (ListRow sm): 10px of padding top
// and bottom, a 13px title at 1.4, a 1px gap, a 16px meta line and the 1px
// hairline between rows. Caps the stacked list to about three rows.
const ROW_HEIGHT_STYLE = {
  "--dms-activity-row-h": "calc(1.25rem + 13px * 1.4 + 1px + 1rem + 1px)",
};

const { t, locale } = useI18n();
const { rows, viewAll, isLoading } = useAccountActivity();

const translate = (key: string, params?: Record<string, string>) =>
  params ? t(key, params) : t(key);
const titleOf = (row: AccountActivityRow): string =>
  translateActivityText(row.title, translate);
const metaOf = (row: AccountActivityRow): string | undefined =>
  row.meta.length
    ? row.meta
        .map((entry) => translateActivityText(entry, translate))
        .join(" · ")
    : undefined;
const timeOf = (row: AccountActivityRow): string =>
  formatRelativeTime(row.date, t, locale.value);

// "Preview as role": the events are the viewer's own, never the role's; a
// row leading to a page the role could not open is veiled like the settings
// cards below, and "View all" is left out when the role could not open it.
const preview = usePermissionPreview();
const previewRole = computed(() => ({
  role: preview.session.value?.roleName ?? "",
}));
function previewState(row: AccountActivityRow) {
  if (!preview.isActive.value || !row.pageId) return null;
  return preview.entryState(row.pageId);
}
function previewLabel(row: AccountActivityRow): string {
  const state = previewState(row);
  if (state === "hidden") {
    return t("page.settings.roles.preview.veil_hidden", previewRole.value);
  }
  return state === "partial"
    ? t("page.settings.roles.preview.veil_partial")
    : "";
}
function previewDetail(row: AccountActivityRow): string | undefined {
  return previewState(row) === "partial"
    ? t("page.settings.roles.preview.menu_partial", previewRole.value)
    : undefined;
}
const viewAllLink = computed(() => {
  const page = viewAll.value;
  if (!page) return undefined;
  if (preview.isActive.value && preview.entryState(page.pageId) === "hidden") {
    return undefined;
  }
  return page.to;
});

// The list scrolls inside the card: the bottom edge fades while more events
// sit below it, and the scroller takes the keyboard focus only when it has
// something to scroll. A partial preview veil puts its badge on the row's
// top edge, so the list leaves it room above the first row.
const isEmpty = computed(() => !isLoading.value && !rows.value.length);
const scroller = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const isOverflowing = ref(false);
const hasMoreBelow = ref(false);
function measureScroll(): void {
  const element = scroller.value;
  if (!element) return;
  isOverflowing.value = element.scrollHeight > element.clientHeight + 1;
  hasMoreBelow.value =
    element.scrollTop + element.clientHeight < element.scrollHeight - 1;
}
useResizeObserver([scroller, content], measureScroll);
onMounted(measureScroll);
</script>

<template>
  <!-- v2 "Recent account activity" card, next to "Your account": the latest
       events of the viewer's own account, newest first. -->
  <DmsCard
    as="section"
    :padded="false"
    :title="t('page.settings.overview.activity.title')"
  >
    <template v-if="viewAllLink" #actions>
      <DmsLink
        :to="viewAllLink"
        class="text-primary inline-flex items-center gap-1 text-[12.5px] font-[550]"
      >
        {{ t("page.settings.overview.activity.view_all") }}
        <UIcon name="i-ph-arrow-right" class="size-3.5" />
      </DmsLink>
    </template>

    <!-- The list never sets the height of the card row. Side by side (lg,
         the breakpoint of the settings overview grid) the grid stretches
         this card to the row height, which "Your account" alone sets: the
         card is a flex column, the body fills what the head leaves, and the
         scroller is taken out of the flow (absolute, inset 0), so it adds
         nothing to the row and scrolls within it. Stacked, there is no card
         to match: the scroller stays in the flow, capped to about three
         rows, the height derived from the feed row metrics below. -->
    <div
      class="relative min-h-0 lg:h-full"
      data-activity-body
      :style="ROW_HEIGHT_STYLE"
    >
      <div
        ref="scroller"
        data-activity-scroll
        class="[scrollbar-width:thin] [scrollbar-color:var(--ui-border-accented)_transparent] overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--ui-primary) max-lg:max-h-[calc(3*var(--dms-activity-row-h)+0.5rem)] lg:absolute lg:inset-0"
        :class="
          hasMoreBelow &&
          '[mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]'
        "
        :tabindex="isOverflowing ? 0 : undefined"
        :role="isOverflowing ? 'region' : undefined"
        :aria-label="
          isOverflowing ? t('page.settings.overview.activity.title') : undefined
        "
        @scroll.passive="measureScroll"
      >
        <div
          ref="content"
          class="lg:min-h-full"
          :class="isEmpty && 'lg:flex lg:flex-col lg:justify-center'"
        >
          <div v-if="isLoading" class="py-1" aria-busy="true">
            <div
              v-for="row in SKELETON_ROWS"
              :key="row"
              class="flex items-start gap-3 px-[18px] py-2.5"
            >
              <USkeleton
                class="size-[30px] shrink-0 rounded-lg bg-(--dms-skeleton)"
              />
              <div class="grid flex-1 gap-1.5 pt-0.5">
                <USkeleton
                  class="h-3 bg-(--dms-skeleton)"
                  :class="SKELETON_TITLE_WIDTHS[row - 1]"
                />
                <USkeleton class="h-2.5 w-1/3 bg-(--dms-skeleton)" />
              </div>
            </div>
          </div>
          <div
            v-else-if="rows.length"
            class="pb-1"
            :class="preview.isActive.value ? 'pt-3' : 'pt-1'"
          >
            <DmsPermissionVeil
              v-for="row in rows"
              :key="row.id"
              :state="previewState(row)"
              :label="previewLabel(row)"
              :detail="previewDetail(row)"
              :persistent="preview.isActive.value"
            >
              <DmsActivityItem
                :icon="row.icon"
                :icon-color="row.tone"
                :title="titleOf(row)"
                :subtitle="metaOf(row)"
                :trailing="timeOf(row)"
                :to="row.to"
                :interactive="!!row.to"
                :data-activity="row.type"
              />
            </DmsPermissionVeil>
          </div>
          <DmsEmptyState
            v-else
            size="sm"
            icon="i-ph-clock-counter-clockwise"
            :title="t('page.settings.overview.activity.empty_title')"
            :description="
              t('page.settings.overview.activity.empty_description')
            "
          />
        </div>
      </div>
    </div>
  </DmsCard>
</template>
