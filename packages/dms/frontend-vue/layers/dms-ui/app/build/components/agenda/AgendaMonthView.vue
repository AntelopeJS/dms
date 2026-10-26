<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { AgendaDropTarget } from "../../composables/agenda/agendaModel";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import {
  layoutMonthWeek,
  monthWeeks,
  rovingToken,
} from "../../composables/agenda/agendaMonthLayout";
import { backgroundSpans } from "../../composables/agenda/agendaBackgroundSpans";
import { isDayKey } from "../../composables/agenda/agendaTime";
import AgendaMonthWeek from "./AgendaMonthWeek.vue";

/**
 * The `month` view: whole weeks (hidden days left out), week numbers on
 * request, multi-day events as bars on lanes, `maxEventsPerDay` chips a day
 * and "+N more" past it. A day number opens the day; a click, a double
 * click or a drag on an empty day creates, as `create.trigger` says. Rows
 * share the height and scroll when the lanes need more.
 */
const ctx = useAgendaContext();
const { t } = useI18n();

const WEEK_NUMBER_WIDTH = "2.25rem";
/** Pixels a row needs: the day number and the lanes. */
const NUMBER_PX = 28;
/** Pixels of a lane, as `density` wants it. */
const LANE_PX = { compact: 18, comfortable: 22 } as const;
const ROW_PADDING_PX = 6;

const weeks = computed(() =>
  monthWeeks(ctx.range.value.days, ctx.options.value.weekStartsOn),
);
const showWeekNumber = computed(
  () => ctx.options.value.raw.weekNumbers === true,
);
const dayCount = computed(() => weeks.value[0]?.days.length ?? 7);
const template = computed(() =>
  [
    showWeekNumber.value ? WEEK_NUMBER_WIDTH : "",
    `repeat(${dayCount.value}, minmax(0, 1fr))`,
  ]
    .filter(Boolean)
    .join(" "),
);
const lanePx = computed(() =>
  ctx.options.value.raw.density === "compact"
    ? LANE_PX.compact
    : LANE_PX.comfortable,
);
const rowMin = computed(
  () =>
    NUMBER_PX +
    Math.max(1, ctx.options.value.maxEventsPerDay) * lanePx.value +
    ROW_PADDING_PX,
);
const layouts = computed(() =>
  weeks.value.map((week) =>
    layoutMonthWeek(
      week.days,
      ctx.occurrences.value,
      ctx.options.value.maxEventsPerDay,
      ctx.view.value.hiddenDays,
    ),
  ),
);

/** The roving element focused last (a day number, a piece, a "+N more"). */
const lastRoving = ref<string | null>(null);

/** Every roving element drawn now. */
const drawnRoving = computed(() => {
  const tokens = new Set<string>();
  layouts.value.forEach((layout, index) => {
    const week = weeks.value[index]!;
    week.days.forEach((day, column) => {
      tokens.add(rovingToken.day(day.key));
      if ((layout.more[column] ?? 0) > 0) tokens.add(rovingToken.more(day.key));
    });
    for (const segment of layout.segments) {
      tokens.add(rovingToken.chip(week.key, segment));
    }
  });
  return tokens;
});

/** The roving tab stop follows the focus, whatever got it. */
function onFocusIn(focus: FocusEvent): void {
  const token = (focus.target as HTMLElement | null)?.closest<HTMLElement>(
    "[data-agenda-roving]",
  )?.dataset.agendaRoving;
  if (token) lastRoving.value = token;
}

/**
 * The one element of the month in the tab order (roving focus): the one
 * focused last when still drawn, else the first piece of the focused event,
 * else the first day number. A bar across two weeks is one tab stop.
 */
const entry = computed(() => {
  if (lastRoving.value && drawnRoving.value.has(lastRoving.value)) {
    return lastRoving.value;
  }
  const focused = ctx.focusedKey.value;
  for (const [index, layout] of layouts.value.entries()) {
    const segment = layout.segments.find(
      (piece) => piece.occurrence.key === focused,
    );
    if (segment) return rovingToken.chip(weeks.value[index]!.key, segment);
  }
  return rovingToken.day(weeks.value[0]?.days[0]?.key ?? "");
});

const ROVING_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowDown: 1,
};

/** The arrows move through the month's day numbers, chips and "+N more" in order. */
function onKeydown(key: KeyboardEvent): void {
  const step = ROVING_STEPS[key.key];
  if (!step || key.altKey || key.ctrlKey || key.metaKey || key.shiftKey) return;
  const current = (key.target as HTMLElement | null)?.closest<HTMLElement>(
    "[data-agenda-roving]",
  );
  const items = bodyEl.value
    ? [...bodyEl.value.querySelectorAll<HTMLElement>("[data-agenda-roving]")]
    : [];
  const next = current ? items[items.indexOf(current) + step] : undefined;
  if (!next) return;
  key.preventDefault();
  key.stopPropagation();
  next.focus();
}
const backgrounds = computed(() =>
  backgroundSpans(ctx.backgrounds.value, ctx.options.value.timeZone).filter(
    (span) => span.background.allDay || isDayKey(span.background.start),
  ),
);

const bodyEl = ref<HTMLElement | null>(null);

/** The day under a point: the week row under it, then its column. */
function targetAt(x: number, y: number): AgendaDropTarget | null {
  const rows = bodyEl.value
    ? [...bodyEl.value.querySelectorAll<HTMLElement>("[data-agenda-week]")]
    : [];
  const index = rows.findIndex((row) => {
    const rect = row.getBoundingClientRect();
    return y >= rect.top && y < rect.bottom;
  });
  const week = weeks.value[index];
  if (!week) return null;
  const row = rows[index]!;
  const rect = row.getBoundingClientRect();
  // The week number button leads the row (its cell wrapper has no box).
  const numberWidth = showWeekNumber.value
    ? (row.querySelector("[role=rowheader] button")?.getBoundingClientRect()
        .width ?? 0)
    : 0;
  const width = (rect.width - numberWidth) / week.days.length;
  const column = Math.min(
    week.days.length - 1,
    Math.max(0, Math.floor((x - rect.left - numberWidth) / width)),
  );
  return { day: week.days[column]!.key };
}

let unregister: (() => void) | undefined;
onMounted(() => {
  if (!bodyEl.value) return;
  unregister = ctx.drag.registerSurface({
    el: bodyEl.value,
    resolve: targetAt,
    scroller: bodyEl.value,
  });
});
onBeforeUnmount(() => unregister?.());
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col"
    role="grid"
    :aria-label="ctx.format.title.value"
    data-agenda-month
  >
    <div
      class="grid border-b border-(--ui-border)"
      :style="{ gridTemplateColumns: template }"
      role="row"
    >
      <div
        v-if="showWeekNumber"
        role="columnheader"
        :aria-label="t('dms.agenda.month.week_number')"
      />
      <div
        v-for="day in weeks[0]?.days ?? []"
        :key="day.weekday"
        class="text-muted truncate px-2 py-1.5 text-center text-xs font-medium"
        role="columnheader"
      >
        {{ ctx.format.day(day.key, "weekdayShort") }}
      </div>
    </div>
    <div
      ref="bodyEl"
      class="grid min-h-0 flex-1 overflow-y-auto overscroll-contain select-none"
      @keydown="onKeydown"
      @focusin="onFocusIn"
      :style="{
        gridTemplateRows: `repeat(${weeks.length}, minmax(${rowMin}px, 1fr))`,
      }"
    >
      <AgendaMonthWeek
        v-for="(week, index) in weeks"
        :key="week.key"
        :week="week"
        :layout="layouts[index]!"
        :template="template"
        :backgrounds="backgrounds"
        :show-week-number="showWeekNumber"
        :entry="entry"
        :lane-px="lanePx"
      />
    </div>
  </div>
</template>
