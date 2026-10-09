<script setup lang="ts">
import { computed, watch } from "vue";
import type { ClassNameValue } from "tailwind-merge";
import DmsStatusPill from "#dms-ui/app/components/status-pill/StatusPill.vue";
import { DMS_TONE_TEXT } from "#dms-ui/app/build/utils/tone";
import { pageHeaderTheme } from "./pageHeaderTheme";
import { useChartFetch } from "#dms-ui/app/composables/chart/useChartFetch";
import { usePageRecord } from "#dms-core/app/build/composables/page/usePageRecord";
import { usePageRecordLabel } from "#dms-core/app/build/composables/page/usePageRecordLabel";
import type {
  PageHeaderRecord,
  PageHeaderSource,
} from "#dms-ui/app/types/page-header";

/**
 * The page header of a detail page (`DefaultLayout({ header: { fetchUrl }
 * })`): who the record is, read from the route — its title, avatar, status,
 * badges and meta line — with the page's own title, text and icon for what it
 * leaves out, and placeholders until it lands. The record it answers is
 * published to the page (`usePageRecord`), where the header's actions and an
 * `ActionList` read their conditions, and its title ends the breadcrumb. Read
 * again, in place, on every page refresh (`refreshPageBlocks()`): after each
 * header action.
 */
interface RecordPageHeaderProps {
  source: PageHeaderSource;
  icon?: string;
  title?: string;
  description?: string;
  class?: ClassNameValue;
}

const props = defineProps<RecordPageHeaderProps>();

const route = useDmsRoute();
const siteLayout = useSiteLayout();
const { processI18n } = useTranslation();
const { setRecord } = usePageRecord();
const { setLabel } = usePageRecordLabel();

const { data, isLoading, error } = useChartFetch<PageHeaderRecord>({
  fetchUrl: props.source.fetchUrl,
  routeParams: () =>
    siteLayout.findMatchingRoute(route.path)?.params as
      | Record<string, string>
      | undefined,
});

// The answer is the record, unless it sets one apart for the conditions.
const record = computed(() => {
  const answer = data.value;
  if (!answer) return null;
  return answer.record ?? (answer as Record<string, unknown>);
});

watch(
  [record, isLoading, error],
  ([current, loading, failure]) => {
    setRecord(route.path, {
      record: current,
      isLoading: loading && !current,
      hasError: !!failure && !current,
    });
  },
  { immediate: true },
);

watch(
  () => data.value?.title,
  (title) => setLabel(route.path, title ? processI18n(title) : undefined),
  { immediate: true },
);

// Placeholders only before the first answer: a refresh keeps the header.
const isPending = computed(() => isLoading.value && !data.value);

const ui = pageHeaderTheme();
const translate = (text: string | undefined) =>
  text ? processI18n(text) : undefined;
const title = computed(() => translate(data.value?.title || props.title));
const description = computed(() =>
  translate(data.value?.subtitle ?? props.description),
);
const icon = computed(() => data.value?.icon || props.icon);
</script>

<template>
  <section :class="ui.root({ class: props.class })">
    <UAvatar
      v-if="data?.avatar?.src"
      :src="data.avatar.src"
      :alt="title"
      :class="ui.avatar()"
    />
    <div
      v-else-if="data?.avatar?.initials"
      :class="ui.badge()"
      aria-hidden="true"
    >
      <span :class="ui.initials()">{{ data.avatar.initials }}</span>
    </div>
    <div v-else-if="icon" :class="ui.badge()">
      <UIcon :name="icon" :class="ui.icon()" size="1.1875rem" />
    </div>

    <div :class="ui.content()">
      <template v-if="isPending">
        <USkeleton :class="ui.skeletonTitle()" />
        <USkeleton :class="ui.skeletonDescription()" />
      </template>
      <template v-else>
        <div :class="ui.heading()">
          <h1 :class="ui.title()">{{ title }}</h1>
          <DmsStatusPill
            v-if="data?.status"
            :tone="data.status.tone"
            :label="translate(data.status.label)"
          />
          <UBadge
            v-for="(badge, index) in data?.badges"
            :key="index"
            :color="badge.tone ?? 'neutral'"
            variant="soft"
            :icon="badge.icon"
            :label="translate(badge.label)"
          />
        </div>
        <p v-if="description" :class="ui.description()">{{ description }}</p>
        <div v-if="data?.meta?.length" :class="ui.meta()">
          <span
            v-for="(item, index) in data.meta"
            :key="index"
            :class="[ui.metaEntry(), item.tone && DMS_TONE_TEXT[item.tone]]"
          >
            <UIcon v-if="item.icon" :name="item.icon" :class="ui.metaIcon()" />
            <span v-if="item.label">{{ translate(item.label) }}</span>
            <span
              v-if="item.value"
              :class="[
                !item.tone && ui.metaValue(),
                item.mono && 'font-mono text-xs',
              ]"
            >
              {{ translate(item.value) }}
            </span>
          </span>
        </div>
      </template>
    </div>

    <slot name="actions" />
  </section>
</template>
