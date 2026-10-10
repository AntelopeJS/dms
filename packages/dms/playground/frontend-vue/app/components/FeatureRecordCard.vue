<script setup lang="ts">
import type { TableViewCardReorder } from "#dms-ui/app/composables/table-view/types";

// The card of the roadmap demo's cards display: a module's own card drawn
// with the DMS record card. The roadmap is ordered by hand, so the card also
// draws the move handle the display hands it.

interface FeatureRow {
  name?: string;
  area?: string;
  owner?: string;
  votes?: number;
}

interface FeatureCardActions {
  canEditRow: (row: FeatureRow) => boolean;
  edit: (row: FeatureRow) => void;
}

interface Props {
  row: FeatureRow;
  selected?: boolean;
  actions: FeatureCardActions;
  open: () => void;
  reorder?: TableViewCardReorder;
}

const props = defineProps<Props>();

const AREA_ICONS: Record<string, string> = {
  Tables: "i-ph-table",
  Forms: "i-ph-textbox",
};

const cardActions = computed(() =>
  props.actions.canEditRow(props.row)
    ? [
        {
          label: "Edit",
          icon: "i-ph-pencil-simple",
          onClick: () => props.actions.edit(props.row),
        },
      ]
    : [],
);
</script>

<template>
  <DmsRecordCard
    :icon="AREA_ICONS[props.row.area ?? ''] ?? 'i-ph-sparkle'"
    :title="props.row.name ?? ''"
    :subtitle="props.row.owner"
    :description="`Requested by ${props.row.votes ?? 0} users, built by ${props.row.owner}.`"
    :tags="[props.row.area ?? '']"
    :meta="`${props.row.votes ?? 0} votes`"
    :actions="cardActions"
    :selected="props.selected"
    :class="{ 'opacity-50': props.reorder?.dragging }"
    interactive
    @open="props.open()"
  >
    <template v-if="props.reorder" #aside>
      <button
        v-bind="props.reorder.handle"
        class="text-dimmed hover:text-highlighted inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40"
      >
        <UIcon name="i-ph-dots-six-vertical" class="size-4" />
      </button>
    </template>
  </DmsRecordCard>
</template>
