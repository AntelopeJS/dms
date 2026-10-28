<script setup lang="ts" generic="T extends Data">
import { computed } from "vue";
import { FlexRender } from "@tanstack/vue-table";
import { normalizeActionConfig } from "#dms-core/app/utils/row-action-rule-evaluator";
import TableEmpty from "./Empty.vue";
import type { Data } from "./Table.types";
import type { TableBodyContext } from "./TableBody.types";
const props = defineProps<{ context: TableBodyContext<T> }>();
const t = computed(() => props.context.t);
const uiTable = computed(() => props.context.uiTable);
const table = computed(() => props.context.table);
const bodyEntries = computed(() => props.context.bodyEntries);
const leadingCellCount = computed(() => props.context.leadingCellCount);
const collapsedGroups = computed(() => props.context.collapsedGroups);
const toggleGroup = computed(() => props.context.toggleGroup);
const isOpenRow = computed(() => props.context.isOpenRow);
const getRowPresence = computed(() => props.context.getRowPresence);
const presenceTooltipText = computed(() => props.context.presenceTooltipText);
const isRowClickable = computed(() => props.context.isRowClickable);
const isSingleClickRow = computed(() => props.context.isSingleClickRow);
const handleRowPointer = computed(() => props.context.handleRowPointer);
const handleRowHover = computed(() => props.context.handleRowHover);
const handleRowLeave = computed(() => props.context.handleRowLeave);
const reorderHandles = computed(() => props.context.reorderHandles);
const hasPresenceRail = computed(() => props.context.hasPresenceRail);
const SELECTION_RAIL_BG = computed(() => props.context.SELECTION_RAIL_BG);
const presenceRailBackground = computed(
  () => props.context.presenceRailBackground,
);
const PRESENCE_RAIL_WIDTH_PX = computed(
  () => props.context.PRESENCE_RAIL_WIDTH_PX,
);
const getPinnedVariant = computed(() => props.context.getPinnedVariant);
const getPinnedLeftOffset = computed(() => props.context.getPinnedLeftOffset);
const getPinnedRightOffset = computed(() => props.context.getPinnedRightOffset);
const syncClippedTitle = computed(() => props.context.syncClippedTitle);
const expandedRowDomId = computed(() => props.context.expandedRowDomId);
const isFirstPageLoading = computed(() => props.context.isFirstPageLoading);
const skeletonRowCount = computed(() => props.context.skeletonRowCount);
const skeletonRowOpacity = computed(() => props.context.skeletonRowOpacity);
const skeletonWidth = computed(() => props.context.skeletonWidth);
const isShowingArchived = computed(() => props.context.isShowingArchived);
const grouping = computed(() => props.context.grouping);
const loading = computed(() => props.context.loading);
const reorder = computed(() => props.context.reorder);
const rowActions = computed(() => props.context.rowActions);
const loadError = computed(() => props.context.loadError);
const emptyStates = computed(() => props.context.emptyStates);
</script>

<template>
  <tbody>
    <template v-if="table.getRowModel().rows?.length">
      <template v-for="{ kind, id, row, key, header } in bodyEntries" :key="id">
        <tr v-if="kind === 'group' && grouping">
          <td
            :colspan="row.getVisibleCells().length + leadingCellCount"
            :class="uiTable.groupCell()"
          >
            <div :class="uiTable.groupHeader()">
              <component
                :is="grouping.collapsible ? 'button' : 'span'"
                :type="grouping.collapsible ? 'button' : undefined"
                :aria-expanded="
                  grouping.collapsible
                    ? !collapsedGroups.includes(key!)
                    : undefined
                "
                :class="uiTable.groupToggle()"
                @click="grouping.collapsible && toggleGroup(key!)"
              >
                <UIcon
                  v-if="grouping.collapsible"
                  :name="
                    collapsedGroups.includes(key!)
                      ? 'i-ph-caret-right'
                      : 'i-ph-caret-down'
                  "
                  class="size-3"
                />
                <component :is="header" />
              </component>
              <span
                v-if="grouping.countOf?.(key!) !== undefined"
                :class="uiTable.groupCount()"
              >
                {{ grouping.countOf(key!) }}
              </span>
            </div>
          </td>
        </tr>
        <template v-else>
          <tr
            :data-row-id="id"
            :data-selected="row.getIsSelected()"
            :data-expanded="row.getIsExpanded()"
            :data-open="isOpenRow(row.original) || undefined"
            :aria-current="isOpenRow(row.original) || undefined"
            :data-presence="!!getRowPresence(row.original)"
            :title="
              getRowPresence(row.original)
                ? presenceTooltipText(getRowPresence(row.original)!)
                : undefined
            "
            :class="[
              uiTable.row({
                loading,
                rowClickable: isRowClickable(row.original),
                presence: !!getRowPresence(row.original),
              }),
              { 'cursor-pointer': isSingleClickRow(row.original) },
            ]"
            @click="handleRowPointer($event, row.original)"
            @dblclick="handleRowPointer($event, row.original)"
            @mouseenter="handleRowHover(row)"
            @mouseleave="handleRowLeave"
            @dragover="reorderHandles.allowDrop"
            @drop="reorderHandles.drop(row.index)"
          >
            <td
              v-if="hasPresenceRail"
              :class="[
                'border-b-muted sticky left-0 z-30 border-b p-0 in-[tr:last-child]:border-b-0',
                row.getIsSelected() && !getRowPresence(row.original)
                  ? SELECTION_RAIL_BG
                  : presenceRailBackground(row.original),
              ]"
              :style="{
                width: PRESENCE_RAIL_WIDTH_PX,
                minWidth: PRESENCE_RAIL_WIDTH_PX,
              }"
            />
            <td v-if="reorder" :class="uiTable.handleCell()">
              <button
                v-bind="reorderHandles.handleFor(row.index)"
                :class="uiTable.handle()"
              >
                <UIcon name="i-ph-dots-six-vertical" />
              </button>
            </td>
            <td
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              :data-pinned="cell.column.getIsPinned()"
              :class="
                uiTable.rowCell({
                  pinned: getPinnedVariant(cell.column),
                  loading,
                  rowClickable: isRowClickable(row.original),
                  cellWrap: cell.column.columnDef.cellWrap,
                })
              "
              :style="{
                left: getPinnedLeftOffset(cell.column),
                right: getPinnedRightOffset(cell.column),
              }"
            >
              <div :class="uiTable.rowContainer()">
                <div :class="uiTable.rowInternal({ loading })">
                  <slot
                    :name="`${cell.column.id}-cell`"
                    v-bind="cell.getContext()"
                  >
                    <div
                      :class="
                        uiTable.rowSpan({
                          cellWrap: cell.column.columnDef.cellWrap,
                        })
                      "
                      @mouseenter="syncClippedTitle"
                    >
                      <FlexRender
                        :render="cell.column.columnDef.cell"
                        :props="cell.getContext()"
                      />
                    </div>
                  </slot>
                </div>
              </div>
            </td>
          </tr>
          <tr v-if="row.getIsExpanded()" :id="expandedRowDomId(row.id)">
            <td
              :colspan="row.getVisibleCells().length + leadingCellCount"
              :class="uiTable.expandedCell()"
            >
              <div :class="uiTable.expandedBody()">
                <slot name="expanded" :row="row" />
              </div>
            </td>
          </tr>
        </template>
      </template>
    </template>
    <!-- First load: skeleton rows keep the column rhythm instead of
                flashing the empty state. -->
    <template v-else-if="isFirstPageLoading">
      <tr
        v-for="rowIndex in skeletonRowCount"
        :key="`skeleton-${rowIndex}`"
        aria-hidden="true"
        :class="uiTable.skeletonRow()"
        :style="{ opacity: skeletonRowOpacity(rowIndex) }"
      >
        <td
          v-if="hasPresenceRail"
          class="border-b-muted border-b p-0 in-[tr:last-child]:border-b-0"
        />
        <td v-if="reorder" :class="uiTable.handleCell()" />
        <td
          v-for="(column, columnIndex) in table.getVisibleLeafColumns()"
          :key="column.id"
          :class="uiTable.rowCell()"
        >
          <USkeleton
            :aria-label="t('dms.a11y.loading')"
            v-if="column.columnDef.meta"
            :class="uiTable.skeletonCell()"
            :style="{ width: skeletonWidth(rowIndex, columnIndex) }"
          />
        </td>
      </tr>
    </template>
    <tr v-else>
      <td
        :colspan="table.getVisibleLeafColumns().length + leadingCellCount"
        class="p-0"
      >
        <div :class="uiTable.emptyBody()">
          <TableEmpty
            :can-add-row="normalizeActionConfig(rowActions?.add).isEnabled"
            :load-error="loadError"
            :archived="isShowingArchived"
            :empty-states="emptyStates"
          />
        </div>
      </td>
    </tr>
  </tbody>
</template>
