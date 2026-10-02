<script setup lang="ts">
import { computed } from "vue";
import DmsCard from "../card/Card.vue";
import DmsKeyValueList, {
  type KeyValueItem,
} from "../key-value-list/KeyValueList.vue";
import DmsBlockStatus from "./BlockStatus.vue";
import { useBlockItems } from "../../composables/blocks/useBlockItems";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

// `KeyValueList` block (interface-dms `base/key-value-list`): label / value
// rows (v2 .c-dl), static or from `fetchUrl` (`{ items }`), in a card by
// default. Labels, details and text values follow the `$` i18n convention.
interface KeyValueListBlockProps extends DefaultComponentProps {
  items?: KeyValueItem[];
  dense?: boolean;
  columns?: number;
  currency?: string;
  /** Eyebrow title of the card head. */
  title?: string;
  /** Card surface around the list; off when it sits inside a Card block. */
  card?: boolean;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  emptyLabel?: string;
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
  emptyLabel: undefined,
  skeletonCount: 3,
});

const TRANSLATED_TYPES = new Set([undefined, "text", "status", "link"]);

const { processI18n } = useTranslation();

const { items, isPending, hasError, refresh } = useBlockItems<KeyValueItem>({
  items: () => props.items,
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  watchActions: props.watchActions,
  componentId: props.componentId,
});

const resolvedItems = computed<KeyValueItem[]>(() =>
  items.value.map((item) => ({
    ...item,
    label: processI18n(item.label ?? ""),
    detail: item.detail ? processI18n(item.detail) : undefined,
    value:
      typeof item.value === "string" && TRANSLATED_TYPES.has(item.type)
        ? processI18n(item.value)
        : item.value,
  })),
);
const title = computed(() =>
  props.title ? processI18n(props.title) : undefined,
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
      :label="props.emptyLabel ? processI18n(props.emptyLabel) : undefined"
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
