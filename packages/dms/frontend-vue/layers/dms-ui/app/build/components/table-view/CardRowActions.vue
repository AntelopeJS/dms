<script setup lang="ts" generic="T extends Record<string, unknown>">
import { computed } from "vue";
import { FlexRender, type Table } from "@tanstack/vue-table";
import { ACTIONS_COLUMN_ID } from "../../composables/table/constants";

/**
 * A card's row actions: the cell of the grid's actions column for the card's
 * row, so its buttons and its … menu offer the same actions, under the same
 * rules and confirmations, as the row does in the grid. Nothing is drawn
 * outside a table (no TanStack instance) or for a table with no row action.
 */
interface CardRowActionsProps {
  table?: Table<T>;
  rowId: string;
}

const props = defineProps<CardRowActionsProps>();

const cell = computed(() =>
  props.table
    ?.getCoreRowModel()
    .rowsById[props.rowId]?.getAllCells()
    .find((candidate) => candidate.column.id === ACTIONS_COLUMN_ID),
);
</script>

<template>
  <!-- Full strength: the grid fades a row's actions until it is hovered,
       which a phone never does. -->
  <div v-if="cell" class="flex shrink-0 [&>div]:opacity-100" @click.stop>
    <FlexRender
      :render="cell.column.columnDef.cell"
      :props="cell.getContext()"
    />
  </div>
</template>
