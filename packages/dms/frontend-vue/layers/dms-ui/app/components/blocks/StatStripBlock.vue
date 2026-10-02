<script setup lang="ts">
import { computed } from "vue";
import DmsStatStrip, {
  type StatStripItem,
  type StatStripLayout,
} from "../stat-strip/StatStrip.vue";
import DmsBlockStatus from "./BlockStatus.vue";
import { useBlockItems } from "../../composables/blocks/useBlockItems";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

// `StatStrip` block (interface-dms `base/stat-strip`): the generic StatStrip
// fed from the block options or from `fetchUrl` (`{ items }`). Texts follow
// the `$` i18n-key convention; numeric values are formatted for the locale.
interface StatStripBlockProps extends DefaultComponentProps {
  items?: StatStripItem[];
  layout?: StatStripLayout;
  columns?: number;
  /** Accessible name of the strip. */
  label?: string;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  /** Title of the empty state. */
  emptyLabel?: string;
  /** Placeholder cells while the first fetch runs. */
  skeletonCount?: number;
}

const props = withDefaults(defineProps<StatStripBlockProps>(), {
  items: () => [],
  layout: "joined",
  columns: undefined,
  label: undefined,
  fetchUrl: undefined,
  fetchUrlMethod: undefined,
  emptyLabel: undefined,
  skeletonCount: 4,
});

const { locale } = useI18n();
const { processI18n } = useTranslation();

const { items, isPending, hasError, refresh } = useBlockItems<StatStripItem>({
  items: () => props.items,
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  watchActions: props.watchActions,
  componentId: props.componentId,
});

function formatValue(value: StatStripItem["value"]): string {
  if (typeof value === "number") {
    return new Intl.NumberFormat(locale.value).format(value);
  }
  return processI18n(String(value ?? ""));
}

const resolvedItems = computed<StatStripItem[]>(() =>
  items.value.map((item) => ({
    ...item,
    eyebrow: processI18n(item.eyebrow ?? ""),
    value: formatValue(item.value),
    detail: item.detail ? processI18n(item.detail) : undefined,
  })),
);
</script>

<template>
  <DmsBlockStatus v-if="hasError" state="error" @retry="refresh()" />
  <DmsBlockStatus
    v-else-if="!isPending && resolvedItems.length === 0"
    state="empty"
    :label="props.emptyLabel ? processI18n(props.emptyLabel) : undefined"
  />
  <DmsStatStrip
    v-else
    :items="resolvedItems"
    :layout="props.layout"
    :columns="props.columns"
    :loading="isPending"
    :skeleton-count="props.columns ?? props.skeletonCount"
    :label="props.label ? processI18n(props.label) : undefined"
  />
</template>
