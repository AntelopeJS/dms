<script setup lang="ts">
import { computed } from "vue";
import DmsStatGroup, {
  type StatGroupItem,
  type StatGroupLayout,
} from "../stat-group/StatGroup.vue";
import DmsBlockStatus, {
  type BlockEmptyText,
} from "../../build/components/blocks/BlockStatus.vue";
import { useBlockItems } from "../../build/composables/blocks/useBlockItems";
import { useComposedText } from "../../../../dms-core/app/composables/translation/useComposedText";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import type { BlockText } from "../../../../dms-core/app/types/composed-text";

// `StatGroup` block (interface-dms `base/stat-group`): the generic StatGroup
// fed from the block options or from `fetchUrl` (`{ items }`). Texts follow
// the `$` i18n-key convention or are composed texts; numeric values are
// formatted for the locale.
interface StatGroupBlockItem
  extends Omit<StatGroupItem, "eyebrow" | "value" | "detail"> {
  eyebrow: BlockText;
  value: BlockText | number;
  detail?: BlockText;
}

interface StatGroupBlockProps extends DefaultComponentProps {
  items?: StatGroupBlockItem[];
  layout?: StatGroupLayout;
  columns?: number;
  /** Accessible name of the group. */
  label?: string;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  /** Id of the PeriodSelector the data follows. */
  periodScope?: string;
  /** Topics whose events make the block read `fetchUrl` again. */
  realtimeTopic?: string | string[];
  /** Shown when there is nothing to list. */
  empty?: BlockEmptyText;
  /**
   * Placeholder cells while the first fetch runs: the length `fetchUrl`
   * usually answers. Optional. Defaults to `columns`, or 4.
   */
  skeletonCount?: number;
}

const props = withDefaults(defineProps<StatGroupBlockProps>(), {
  items: () => [],
  layout: "joined",
  columns: undefined,
  label: undefined,
  fetchUrl: undefined,
  fetchUrlMethod: undefined,
  periodScope: undefined,
  realtimeTopic: undefined,
  empty: undefined,
  skeletonCount: undefined,
});

const DEFAULT_SKELETON_COUNT = 4;

const { processText } = useComposedText();

const { items, isPending, hasError, refresh } =
  useBlockItems<StatGroupBlockItem>({
    items: () => props.items,
    fetchUrl: props.fetchUrl,
    fetchUrlMethod: props.fetchUrlMethod,
    periodScope: props.periodScope,
    realtimeTopic: props.realtimeTopic,
    routeParams: () => props.routeParams,
    watchActions: props.watchActions,
    componentId: props.componentId,
  });

const resolvedItems = computed<StatGroupItem[]>(() =>
  items.value.map((item) => ({
    ...item,
    eyebrow: processText(item.eyebrow),
    value: processText(item.value),
    detail: item.detail ? processText(item.detail) : undefined,
  })),
);
</script>

<template>
  <DmsBlockStatus v-if="hasError" state="error" @retry="refresh()" />
  <DmsBlockStatus
    v-else-if="!isPending && resolvedItems.length === 0"
    state="empty"
    :empty="props.empty"
  />
  <DmsStatGroup
    v-else
    :items="resolvedItems"
    :layout="props.layout"
    :columns="props.columns"
    :loading="isPending"
    :skeleton-count="
      props.skeletonCount ?? props.columns ?? DEFAULT_SKELETON_COUNT
    "
    :label="props.label ? processText(props.label) : undefined"
  />
</template>
