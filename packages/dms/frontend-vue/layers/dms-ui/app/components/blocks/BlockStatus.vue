<script setup lang="ts">
import DmsEmptyState from "../empty-state/EmptyState.vue";

// What a data-driven block shows instead of its content: an empty list, or a
// first load that failed (with a retry). Compact v2 .c-empty in a card, so it
// keeps the footprint of the block it stands in for.
interface BlockStatusProps {
  /** `empty`: nothing to show. `error`: the first load failed. */
  state: "empty" | "error";
  /** Replaces the default title of the state. */
  label?: string;
  /** Draw the card surface around it (off inside a card). */
  card?: boolean;
}

interface BlockStatusEmits {
  (e: "retry"): void;
}

const props = withDefaults(defineProps<BlockStatusProps>(), {
  label: undefined,
  card: true,
});
const emit = defineEmits<BlockStatusEmits>();

const { t } = useI18n();
</script>

<template>
  <div :class="props.card && 'dms-card'">
    <DmsEmptyState
      size="sm"
      :variant="props.state === 'error' ? 'error' : 'no-data'"
      :title="
        props.label ??
        (props.state === 'error'
          ? t('dms.blocks.load_error')
          : t('dms.blocks.empty'))
      "
      :description="
        props.state === 'error' ? t('dms.blocks.load_error_hint') : undefined
      "
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
    </DmsEmptyState>
  </div>
</template>
