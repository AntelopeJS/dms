<script setup lang="ts">
import { computed } from "vue";
import type { AgendaResource } from "../../../types/full-agenda";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import type { AgendaGridHeaderCell } from "../../composables/agenda/agendaTimeGridLayout";
import { GRID_GUTTER_WIDTH } from "../../composables/agenda/agendaTimeGridParts";
import { agendaColorCss } from "../../composables/agenda/agendaPaint";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The header rows of a time grid, outer level first: resource groups (a
 * button folds a group into a narrow column), resources (avatar, name,
 * dimmed description) and days (today marked; a click opens the day). The
 * corner holds the week number.
 */
interface AgendaGridHeaderProps {
  rows: AgendaGridHeaderCell[][];
  template: string;
  /** "W44" in the corner, or nothing. */
  weekLabel?: string;
}

const props = withDefaults(defineProps<AgendaGridHeaderProps>(), {
  weekLabel: "",
});

const ctx = useAgendaContext();
const { t } = useI18n();
const { processText } = useComposedText();

const INITIALS_LENGTH = 2;

/** A day header opens the day, unless the view already is one day. */
const isCompact = computed(() => ctx.options.value.raw.density === "compact");
const opensDay = computed(
  () => ctx.view.value.type !== "day" && ctx.range.value.days.length > 1,
);

const groupOf = (id: string | undefined) =>
  ctx.resourceGroups.value.find((group) => group.id === id);
const groupLabel = (id: string | undefined) => {
  const group = groupOf(id);
  return group ? processText(group.label) : "";
};
const isFolded = (id: string | undefined) =>
  id ? ctx.foldedGroups.value.has(id) : false;

function initials(resource: AgendaResource): string {
  if (resource.avatar?.initials) return resource.avatar.initials;
  return processText(resource.label)
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, INITIALS_LENGTH)
    .toUpperCase();
}

function avatarStyle(resource: AgendaResource) {
  const color = agendaColorCss(
    resource.avatar?.color ?? resource.color ?? "neutral",
  );
  return {
    backgroundColor: `color-mix(in oklab, ${color} 18%, var(--ui-bg))`,
    color: `color-mix(in oklab, ${color} 75%, var(--ui-text-highlighted))`,
  };
}

const cellStyle = (cell: AgendaGridHeaderCell) => ({
  gridColumn: `${cell.start + 2} / span ${cell.span}`,
});
</script>

<template>
  <div
    v-for="(row, depth) in props.rows"
    :key="depth"
    class="grid border-b border-(--ui-border)"
    :style="{ gridTemplateColumns: props.template }"
    role="row"
  >
    <div
      class="text-dimmed sticky start-0 z-20 flex items-end justify-center border-e border-(--ui-border) bg-(--ui-bg) pb-1 text-[10px] font-medium"
      :style="{ width: `${GRID_GUTTER_WIDTH}px` }"
      role="columnheader"
    >
      <span v-if="depth === props.rows.length - 1 && props.weekLabel">
        {{ props.weekLabel }}
      </span>
    </div>
    <div
      v-for="cell in row"
      :key="cell.key"
      class="flex min-w-0 items-center justify-center border-e border-(--ui-border) px-1"
      :class="isCompact ? 'py-0.5' : 'py-1'"
      :style="cellStyle(cell)"
      role="columnheader"
    >
      <template v-if="cell.kind === 'group'">
        <button
          v-if="cell.column.groupId"
          type="button"
          class="text-muted hover:text-highlighted flex min-w-0 items-center gap-1 text-xs font-semibold"
          :aria-expanded="!isFolded(cell.column.groupId)"
          :aria-label="
            t(
              isFolded(cell.column.groupId)
                ? 'dms.agenda.grid.group_unfold'
                : 'dms.agenda.grid.group_fold',
              { group: groupLabel(cell.column.groupId) },
            )
          "
          @click="ctx.toggleGroup(cell.column.groupId)"
        >
          <UIcon
            :name="
              isFolded(cell.column.groupId)
                ? 'i-ph-caret-right'
                : 'i-ph-caret-down'
            "
            class="size-3 shrink-0"
          />
          <span class="truncate" :class="cell.column.folded && 'sr-only'">
            {{ groupLabel(cell.column.groupId) }}
          </span>
        </button>
      </template>
      <template v-else-if="cell.kind === 'resource' && cell.column.unassigned">
        <span class="text-muted truncate text-xs font-medium italic">
          {{ t("dms.agenda.grid.unassigned") }}
        </span>
      </template>
      <template v-else-if="cell.kind === 'resource' && cell.column.resource">
        <div class="flex min-w-0 items-center gap-1.5">
          <img
            v-if="cell.column.resource.avatar?.src"
            :src="cell.column.resource.avatar.src"
            alt=""
            class="size-6 shrink-0 rounded-full object-cover"
          />
          <span
            v-else
            class="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
            :style="avatarStyle(cell.column.resource)"
            aria-hidden="true"
          >
            {{ initials(cell.column.resource) }}
          </span>
          <span class="flex min-w-0 flex-col leading-tight">
            <span
              class="text-highlighted flex items-center gap-1 truncate text-xs font-medium"
              :title="processText(cell.column.resource.label)"
            >
              {{ processText(cell.column.resource.label) }}
              <UIcon
                v-if="cell.column.resource.editable === false"
                name="i-ph-lock-simple"
                class="text-dimmed size-3"
              />
            </span>
            <span
              v-if="cell.column.resource.description"
              class="text-dimmed truncate text-[10px]"
              :title="processText(cell.column.resource.description)"
            >
              {{ processText(cell.column.resource.description) }}
            </span>
          </span>
        </div>
      </template>
      <template v-else-if="cell.kind === 'day' && !cell.column.folded">
        <component
          :is="opensDay ? 'button' : 'div'"
          :type="opensDay ? 'button' : undefined"
          class="flex items-center gap-1 text-xs"
          :class="opensDay && 'hover:text-primary'"
          :aria-label="ctx.format.day(cell.column.day.key, 'long')"
          @click="opensDay && ctx.goTo(cell.column.day.key, 'day')"
        >
          <span class="text-muted">
            {{ ctx.format.day(cell.column.day.key, "weekdayShort") }}
          </span>
          <span
            class="flex size-6 items-center justify-center rounded-full font-semibold tabular-nums"
            :class="
              cell.column.day.isToday
                ? 'bg-primary text-inverted'
                : 'text-highlighted'
            "
          >
            {{ cell.column.day.dayOfMonth }}
          </span>
        </component>
      </template>
    </div>
  </div>
</template>
