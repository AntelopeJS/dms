<script setup lang="ts">
import { computed } from "vue";
import DmsEmptyState from "../../../components/empty-state/EmptyState.vue";
import DmsBlockActions from "./BlockActions.vue";
import { type FetchNotFound, notFoundTexts } from "../../utils/fetchNotFound";

/** What a block shows when it has nothing to list (interface-dms `BlockEmptyText`). */
export interface BlockEmptyText {
  /** `$`-prefixed for an i18n key, like `description`. */
  title: string;
  description?: string;
}

/**
 * `empty`: nothing to show. `error`: the first load failed. `not-found`: the
 * source answered 404, what the block shows does not exist.
 */
export type BlockStatusState = "empty" | "error" | "not-found";

// What a data-driven block shows instead of its content: an empty list, a
// first load that failed (with a retry), or a source that answered 404.
// Compact v2 .c-empty in a card, so it keeps the footprint of the block it
// stands in for.
interface BlockStatusProps {
  state: BlockStatusState;
  /** Replaces the default texts of the empty state. */
  empty?: BlockEmptyText;
  /** What the 404 said, laid over the default not-found texts. */
  notFound?: FetchNotFound | null;
  /** Draw the card surface around it (off inside a card). */
  card?: boolean;
}

interface BlockStatusEmits {
  (e: "retry"): void;
}

const props = withDefaults(defineProps<BlockStatusProps>(), {
  empty: undefined,
  notFound: undefined,
  card: true,
});
const emit = defineEmits<BlockStatusEmits>();

const VARIANTS = {
  empty: "no-data",
  error: "error",
  "not-found": "no-result",
} as const;

const { t } = useI18n();
const { processI18n } = useTranslation();

const translate = (text: string | undefined) =>
  text ? processI18n(text) : undefined;

const notFoundState = computed(() => {
  const answered = props.notFound?.emptyState ?? {};
  const defaults = notFoundTexts(props.notFound, t);
  return {
    title: translate(answered.title) ?? defaults.title,
    description: translate(answered.description) ?? defaults.description,
    icon: answered.icon,
    tone: answered.tone,
    actions: answered.actions ?? [],
  };
});

const isNotFound = computed(() => props.state === "not-found");

const title = computed(() => {
  if (props.state === "error") return t("dms.blocks.load_error");
  if (isNotFound.value) return notFoundState.value.title;
  return props.empty ? processI18n(props.empty.title) : t("dms.blocks.empty");
});

const description = computed(() => {
  if (props.state === "error") return t("dms.blocks.load_error_hint");
  if (isNotFound.value) return notFoundState.value.description;
  return translate(props.empty?.description);
});
</script>

<template>
  <div :class="props.card && 'dms-card'">
    <DmsEmptyState
      size="sm"
      :variant="VARIANTS[props.state]"
      :icon="isNotFound ? notFoundState.icon : undefined"
      :tone="isNotFound ? notFoundState.tone : undefined"
      :title="title"
      :description="description"
    >
      <template v-if="props.state === 'error'" #actions>
        <UButton
          :label="t('dms.blocks.retry')"
          icon="i-ph-arrows-clockwise"
          color="neutral"
          variant="outline"
          size="sm"
          @click="emit('retry')"
        />
      </template>
      <template v-else-if="isNotFound && notFoundState.actions.length" #actions>
        <DmsBlockActions :actions="notFoundState.actions" size="sm" />
      </template>
    </DmsEmptyState>
  </div>
</template>
