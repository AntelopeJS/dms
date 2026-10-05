<script setup lang="ts">
import { computed } from "vue";
import DmsEmptyState, {
  type EmptyStateSize,
  type EmptyStateVariant,
} from "../empty-state/EmptyState.vue";
import DmsBlockActions, { type BlockAction } from "./BlockActions.vue";
import type { DmsTone } from "../../utils/tone";
import { useWatch } from "../../../../dms-core/app/composables/watch/useWatch";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

// `EmptyState` block (interface-dms `base/empty-state`): the generic v2
// .c-empty placed on a page — a first-run screen, a "nothing here yet" panel
// — with link actions. In a card by default. Texts follow the `$` i18n-key
// convention.
interface EmptyStateBlockProps extends Partial<DefaultComponentProps> {
  title?: string;
  description?: string;
  variant?: EmptyStateVariant;
  icon?: string;
  tone?: DmsTone;
  /** Hatched panel behind the content. */
  hatched?: boolean;
  size?: EmptyStateSize;
  actions?: BlockAction[];
  /** Card surface around it; off when it sits inside a Card block. */
  card?: boolean;
}

const props = withDefaults(defineProps<EmptyStateBlockProps>(), {
  title: "",
  description: undefined,
  variant: "no-data",
  icon: undefined,
  tone: undefined,
  hatched: false,
  size: "md",
  actions: () => [],
  card: true,
});

useWatch(props.watchActions || [], props.componentId);

const { processI18n } = useTranslation();

const description = computed(() =>
  props.description ? processI18n(props.description) : undefined,
);
</script>

<template>
  <div :class="props.card && 'dms-card overflow-hidden'">
    <DmsEmptyState
      :title="processI18n(props.title)"
      :description="description"
      :variant="props.variant"
      :icon="props.icon"
      :tone="props.tone"
      :hatched="props.hatched"
      :size="props.size"
    >
      <template v-if="props.actions.length" #actions>
        <DmsBlockActions :actions="props.actions" size="sm" />
      </template>
    </DmsEmptyState>
  </div>
</template>
