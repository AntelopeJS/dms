<script setup lang="ts">
import { computed } from "vue";
import DmsCard from "../card/Card.vue";
import DmsKeyValueList, {
  type KeyValueItem,
} from "../key-value-list/KeyValueList.vue";
import DmsBlockStatus, {
  type BlockEmptyText,
} from "../../build/components/blocks/BlockStatus.vue";
import { useBlockItems } from "../../build/composables/blocks/useBlockItems";
import { useComposedText } from "../../../../dms-core/app/composables/translation/useComposedText";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import type { BlockText } from "../../../../dms-core/app/types/composed-text";
import { isComposedText } from "../../../../dms-core/app/utils/composedText";

// `KeyValueList` block (interface-dms `base/key-value-list`): label / value
// rows (v2 .c-dl), static or from `fetchUrl` (`{ items }`), in a card by
// default. Labels, details and text values follow the `$` i18n convention or
// are composed texts.
interface KeyValueListBlockItem
  extends Omit<KeyValueItem, "label" | "value" | "detail"> {
  label: BlockText;
  value?: BlockText | number | null;
  detail?: BlockText;
}

interface KeyValueListBlockProps extends DefaultComponentProps {
  items?: KeyValueListBlockItem[];
  dense?: boolean;
  columns?: number;
  currency?: string;
  /** Eyebrow title of the card head. */
  title?: string;
  /** Card surface around the list; off when it sits inside a Card block. */
  card?: boolean;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  /** Id of the PeriodSelector the data follows. */
  periodScope?: string;
  /** Topics whose events make the block read `fetchUrl` again. */
  realtimeTopic?: string | string[];
  /** Shown when there is nothing to list. */
  empty?: BlockEmptyText;
  /**
   * Placeholder rows while `fetchUrl` loads: the length it usually answers.
   * Optional. Defaults to 5.
   */
  skeletonCount?: number;
}

const props = withDefaults(defineProps<KeyValueListBlockProps>(), {
  items: () => [],
  dense: false,
  columns: 1,
  currency: "EUR",
  title: undefined,
  card: true,
  fetchUrl: undefined,
  fetchUrlMethod: undefined,
  periodScope: undefined,
  realtimeTopic: undefined,
  empty: undefined,
  // A fetched list's length is unknown until it lands: draw the rows a record
  // card usually lists (customer, ids, status, amounts, dates), not a stub.
  skeletonCount: 5,
});

const TRANSLATED_TYPES = new Set([undefined, "text", "status", "link"]);

const { processText } = useComposedText();

const { items, isPending, hasError, refresh } =
  useBlockItems<KeyValueListBlockItem>({
    items: () => props.items,
    fetchUrl: props.fetchUrl,
    fetchUrlMethod: props.fetchUrlMethod,
    periodScope: props.periodScope,
    realtimeTopic: props.realtimeTopic,
    routeParams: () => props.routeParams,
    watchActions: props.watchActions,
    componentId: props.componentId,
  });

// A composed value already says how each of its parameters is written, so it
// is composed whatever the row's type; a plain one is translated only where
// the type draws text.
function resolveValue(item: KeyValueListBlockItem): KeyValueItem["value"] {
  if (isComposedText(item.value)) return processText(item.value);
  if (typeof item.value === "string" && TRANSLATED_TYPES.has(item.type)) {
    return processText(item.value);
  }
  return item.value as KeyValueItem["value"];
}

const resolvedItems = computed<KeyValueItem[]>(() =>
  items.value.map((item) => ({
    ...item,
    label: processText(item.label),
    detail: item.detail ? processText(item.detail) : undefined,
    value: resolveValue(item),
  })),
);
const title = computed(() =>
  props.title ? processText(props.title) : undefined,
);
const isEmpty = computed(
  () => !isPending.value && !hasError.value && resolvedItems.value.length === 0,
);
// A card with a head gets its body padding from the list itself, so the rows'
// hairlines run to the same inset as the head's.
const listClass = computed(() => (props.card ? "px-[18px] py-2" : undefined));
</script>

<template>
  <component
    :is="props.card ? DmsCard : 'div'"
    v-bind="props.card ? { padded: false, title } : {}"
  >
    <DmsBlockStatus
      v-if="hasError"
      state="error"
      :card="false"
      @retry="refresh()"
    />
    <DmsBlockStatus
      v-else-if="isEmpty"
      state="empty"
      :card="false"
      :empty="props.empty"
    />
    <DmsKeyValueList
      v-else
      :class="listClass"
      :items="resolvedItems"
      :dense="props.dense"
      :columns="props.columns"
      :currency="props.currency"
      :loading="isPending"
      :skeleton-count="props.skeletonCount"
    />
  </component>
</template>
