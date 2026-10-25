<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import {
  dayBreaks,
  type TimelineColumn,
} from "../../composables/agenda/agendaTimelineLayout";
import { zonedEpoch } from "../../composables/agenda/agendaTime";
import { useAgendaTimeline } from "../../composables/agenda/useAgendaTimeline";
import AgendaResourceHeader from "./AgendaResourceHeader.vue";
import AgendaTimelineHeader from "./AgendaTimelineHeader.vue";
import AgendaTimelineRow from "./AgendaTimelineRow.vue";

/**
 * A `timeline`: a row per resource (grouped, groups folding with their
 * count), time running left to right by hour, named slot or day, with the
 * resource column and the header sticky while it scrolls both ways.
 * Overlapping events stack in lanes and the row grows; a long event runs on
 * across days in segments. Empty time takes clicks (create, ranges) and
 * drops (it registers a drop surface with the drag engine).
 */
const ctx = useAgendaContext();
const { t } = useI18n();

const scroller = ref<HTMLElement | null>(null);
const body = ref<HTMLElement | null>(null);
const state = useAgendaTimeline(ctx, { scroller, body });

const SCROLL_MARGIN_COLUMNS = 0.5;
const SATURDAY = 6;

const count = computed(() => Math.max(1, state.columns.value.length));
const percent = (position: number) => `${(position / count.value) * 100}%`;
const breaks = computed(() =>
  dayBreaks(state.columns.value, state.scale.value),
);
const separators = computed(() =>
  state.scale.value === "day"
    ? state.headerGroups.value.slice(1).map((group) => group.first)
    : breaks.value,
);

/** Runs of columns to tint: today's, and the weekends of a timeline by day. */
function columnRuns(predicate: (column: TimelineColumn) => boolean) {
  const runs: { from: number; to: number }[] = [];
  for (const column of state.columns.value) {
    if (!predicate(column)) continue;
    const last = runs.at(-1);
    if (last && last.to === column.index) last.to += 1;
    else runs.push({ from: column.index, to: column.index + 1 });
  }
  return runs;
}

const todayRuns = computed(() => columnRuns((column) => column.isToday));
const weekendRuns = computed(() =>
  state.scale.value === "day"
    ? columnRuns(
        (column) => column.weekday === 0 || column.weekday === SATURDAY,
      )
    : [],
);

const nowPosition = computed(() => {
  if (
    state.scale.value === "day" ||
    ctx.options.value.raw.nowIndicator === false
  )
    return null;
  return state.positionOf(ctx.now.value);
});

const gridLines = computed(() => ({
  backgroundImage:
    "linear-gradient(to right, var(--ui-border) 1px, transparent 1px)",
  backgroundSize: `${100 / count.value}% 100%`,
}));

const cornerLabel = computed(() =>
  ctx.resources.value.length ? t("dms.agenda.timeline.resources") : "",
);

/** The rows the drag preview falls on: only they redraw while dragging. */
const previewRows = computed(() => {
  const preview = ctx.drag.preview.value;
  if (!preview || preview.toPending) return new Set<string>();
  if (!preview.resourceIds.length) return new Set(["r:none"]);
  return new Set(preview.resourceIds.map((id) => `r:${id}`));
});

const isOnEvent = (event: Event) =>
  !!(event.target as HTMLElement | null)?.closest?.(
    "[data-agenda-occurrence],[data-agenda-row-header]",
  );

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || isOnEvent(event)) return;
  const target = state.targetAt(event.clientX, event.clientY, false);
  if (target) ctx.drag.startEmpty(event, target);
}

function onClick(event: MouseEvent, double: boolean): void {
  if (isOnEvent(event)) return;
  const target = state.targetAt(event.clientX, event.clientY, true);
  if (target) ctx.clickEmpty(target, double);
}

/** Opens a timeline by hour scrolled to `scrollTime` of today (or of its first day). */
function scrollToTime(): void {
  const el = scroller.value;
  const columns = state.columns.value;
  if (!el || state.scale.value !== "hour" || !columns.length) return;
  const day = columns.find((column) => column.isToday)?.day ?? columns[0]!.day;
  const epoch = zonedEpoch(
    day,
    ctx.options.value.scrollMinutes,
    ctx.options.value.timeZone,
  );
  const position = state.positionOf(epoch);
  if (position === null) return;
  const trackWidth = el.scrollWidth - state.resourceWidth.value;
  el.scrollLeft = Math.max(
    0,
    ((position - SCROLL_MARGIN_COLUMNS) / count.value) * trackWidth,
  );
}

let unregister: (() => void) | undefined;

onMounted(() => {
  if (scroller.value) {
    unregister = ctx.drag.registerSurface({
      el: scroller.value,
      scroller: scroller.value,
      resolve: (x, y) => state.targetAt(x, y, false),
    });
  }
  scrollToTime();
});

onBeforeUnmount(() => unregister?.());

watch(
  () => [ctx.range.value.from, ctx.view.value.id],
  () => nextTick(scrollToTime),
);
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div
      ref="scroller"
      class="relative min-h-0 flex-1 overflow-auto overscroll-contain"
      role="grid"
      :aria-label="t('dms.agenda.timeline.label')"
      :aria-rowcount="state.rows.value.length + 1"
    >
      <div
        class="relative min-w-full"
        :style="{
          width: `max(100%, ${state.resourceWidth.value + state.trackMinWidth.value}px)`,
        }"
      >
        <AgendaTimelineHeader
          :scale="state.scale.value"
          :columns="state.columns.value"
          :groups="state.headerGroups.value"
          :slots="state.slots.value"
          :format="ctx.format"
          :resource-width="state.resourceWidth.value"
          :corner-label="cornerLabel"
        />
        <div
          ref="body"
          class="relative"
          :style="{ height: `${state.bodyHeight.value}px` }"
          @pointerdown="onPointerDown"
          @click="onClick($event, false)"
          @dblclick="onClick($event, true)"
        >
          <div
            class="pointer-events-none absolute inset-y-0 end-0"
            :style="{ left: `${state.resourceWidth.value}px`, ...gridLines }"
          >
            <div
              v-for="run in weekendRuns"
              :key="`w${run.from}`"
              class="bg-elevated/50 absolute inset-y-0"
              :style="{
                left: percent(run.from),
                width: percent(run.to - run.from),
              }"
            />
            <div
              v-for="run in todayRuns"
              :key="`t${run.from}`"
              class="bg-primary/5 absolute inset-y-0"
              :style="{
                left: percent(run.from),
                width: percent(run.to - run.from),
              }"
            />
            <div
              v-for="at in separators"
              :key="`s${at}`"
              class="absolute inset-y-0 w-px bg-(--ui-border-accented)"
              :style="{ left: percent(at) }"
            />
          </div>
          <div
            v-for="(row, index) in state.rows.value"
            :key="row.key"
            class="border-default absolute inset-x-0 flex border-b"
            :class="row.kind === 'group' ? 'bg-elevated/60' : ''"
            role="row"
            :aria-rowindex="index + 2"
            :style="{ top: `${row.top}px`, height: `${row.height}px` }"
          >
            <div
              class="border-default sticky left-0 z-10 shrink-0 border-e"
              :class="row.kind === 'group' ? 'bg-elevated' : 'bg-default'"
              data-agenda-row-header
              role="rowheader"
              :style="{ width: `${state.resourceWidth.value}px` }"
            >
              <AgendaResourceHeader
                v-if="row.kind === 'group'"
                :group="row.group"
                :count="row.count"
                :folded="row.folded"
                :compact="ctx.compact.value"
                @toggle="ctx.toggleGroup(row.group.id)"
              />
              <AgendaResourceHeader
                v-else
                :resource="row.resource"
                :compact="ctx.compact.value"
              />
            </div>
            <AgendaTimelineRow
              v-if="row.kind === 'resource'"
              :row="row"
              :columns="state.columns.value"
              :breaks="breaks"
              :shades="state.shades.value.get(row.key) ?? []"
              :metrics="state.metrics.value"
              :preview="
                previewRows.has(row.key) ? ctx.drag.preview.value : null
              "
            />
          </div>
          <div
            v-if="nowPosition !== null"
            class="pointer-events-none absolute inset-y-0 end-0 z-[3]"
            :style="{ left: `${state.resourceWidth.value}px` }"
            aria-hidden="true"
          >
            <div
              class="bg-error absolute inset-y-0 w-0.5 -translate-x-1/2"
              :style="{ left: percent(nowPosition) }"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
