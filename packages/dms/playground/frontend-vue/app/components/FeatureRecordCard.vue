<script setup lang="ts">
// The card of the roadmap demo's cards display: a module's own card drawn
// with the DMS record card.

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
    interactive
    @open="props.open()"
  />
</template>
