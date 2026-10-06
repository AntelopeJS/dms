<script setup lang="ts">
import { computed } from "vue";
import DmsCard from "../card/Card.vue";
import DmsSectionHeader from "../section-header/SectionHeader.vue";
import DmsBlockActions, {
  type BlockAction,
} from "../../build/components/blocks/BlockActions.vue";
import { useWatch } from "../../../../dms-core/app/composables/watch/useWatch";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

// `Card` block (interface-dms `base/card`): a titled v2 card holding other
// blocks. Children without a slot stack in the body; a child in the
// `actions` slot joins the head's link actions, one in the `footer` slot
// fills the muted foot band. Texts follow the `$` i18n-key convention.
interface CardBlockProps extends Partial<DefaultComponentProps> {
  /** Eyebrow title of the card head. */
  title?: string;
  /** Mono count after the title. */
  count?: number | string;
  /** One dim line under the title. */
  description?: string;
  /** Link buttons on the right of the head. */
  actions?: BlockAction[];
  /** Muted text in the foot band. */
  footer?: string;
  /** Body padding; off for a list or a table running edge to edge. */
  padded?: boolean;
  /** `elevated`: stronger shadow for a card on an empty backdrop. */
  variant?: "default" | "elevated";
}

interface CardBlockSlots {
  default?: () => unknown;
  actions?: () => unknown;
  footer?: () => unknown;
}

const props = withDefaults(defineProps<CardBlockProps>(), {
  title: undefined,
  count: undefined,
  description: undefined,
  actions: () => [],
  footer: undefined,
  padded: true,
  variant: "default",
});
const slots = defineSlots<CardBlockSlots>();

useWatch(props.watchActions || [], props.componentId);

const { processI18n } = useTranslation();

const title = computed(() =>
  props.title ? processI18n(props.title) : undefined,
);
const description = computed(() =>
  props.description ? processI18n(props.description) : undefined,
);
const hasHeading = computed(() => !!title.value || !!description.value);
const hasActions = computed(() => props.actions.length > 0 || !!slots.actions);
const hasFooter = computed(() => !!props.footer || !!slots.footer);
</script>

<template>
  <DmsCard :padded="props.padded" :variant="props.variant">
    <template v-if="hasHeading" #header>
      <DmsSectionHeader
        size="card"
        class="min-w-0 flex-1"
        :title="title"
        :count="props.count"
        :description="description"
      />
    </template>
    <template v-if="hasActions" #actions>
      <DmsBlockActions
        :actions="props.actions"
        size="xs"
        lead-variant="ghost"
        lead-color="neutral"
        rest-variant="ghost"
      />
      <slot name="actions" />
    </template>

    <!-- grid-cols-1: one minmax(0, 1fr) track, so a wide child (a long
         key / value) truncates instead of pushing past the card. -->
    <div class="grid grid-cols-1 gap-4">
      <slot />
    </div>

    <template v-if="hasFooter" #footer>
      <span v-if="props.footer" class="text-muted min-w-0 flex-1 text-xs">
        {{ processI18n(props.footer) }}
      </span>
      <slot name="footer" />
    </template>
  </DmsCard>
</template>
