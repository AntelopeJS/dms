<script setup lang="ts">
import type { TableViewCardReorder } from "#dms-ui/app/composables/table-view/types";

// The card of the roadmap demo's cards display: a module's own card drawn
// with the DMS record card. The roadmap is ordered by hand, so the card also
// draws the move handle the display hands it. Its footer buttons are the
// row's custom actions (`actions.customFor`), run with `actions.custom`.

interface FeatureRow {
  name?: string;
  area?: string;
  owner?: string;
  votes?: number;
}

interface CustomRowAction {
  id?: string;
  label: string;
  icon?: string;
}

interface FeatureCardActions {
  canEditRow: (row: FeatureRow) => boolean;
  edit: (row: FeatureRow) => void;
  /** The custom row actions the row offers (their `rule` accepted). */
  customFor: (row: FeatureRow) => CustomRowAction[];
  /** Runs a custom row action on the row, as its grid menu entry does. */
  custom: (action: CustomRowAction, row?: FeatureRow) => void;
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

const customActions = computed(() =>
  props.actions.customFor(props.row).map((action) => ({
    label: action.label,
    icon: action.icon,
    onClick: () => props.actions.custom(action, props.row),
  })),
);

const editAction = computed(() =>
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

const cardActions = computed(() => [
  ...customActions.value,
  ...editAction.value,
]);
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
