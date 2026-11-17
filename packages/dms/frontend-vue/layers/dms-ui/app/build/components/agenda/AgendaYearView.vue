<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { useAgendaYear } from "../../composables/agenda/useAgendaYear";
import AgendaYearMonths from "./AgendaYearMonths.vue";
import AgendaYearPlanner from "./AgendaYearPlanner.vue";

/**
 * A `year`: twelve months as a planner (a row per month) or as twelve small
 * months (`yearLayout`). With `rangeSelect: "twoClicks"`, a first click on a
 * day waits for the last one, the days between highlighted under the
 * pointer, a hint line saying so (Esc gives up). Days take drops too.
 */
const ctx = useAgendaContext();
const { t } = useI18n();
const state = useAgendaYear(ctx);

const scroller = ref<HTMLElement | null>(null);
let unregister: (() => void) | undefined;

onMounted(() => {
  if (!scroller.value) return;
  unregister = ctx.drag.registerSurface({
    el: scroller.value,
    scroller: scroller.value,
    resolve: state.resolvePoint,
  });
});

onBeforeUnmount(() => unregister?.());

watch(
  () => ctx.rangeAnchor.value,
  (anchor) => {
    if (!anchor) state.hoverDay.value = null;
  },
);

function cancelRange(): void {
  ctx.rangeAnchor.value = null;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || !ctx.rangeAnchor.value) return;
  event.stopPropagation();
  cancelRange();
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col" @keydown="onKeydown">
    <div
      v-if="ctx.rangeAnchor.value"
      class="border-default bg-primary/5 flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-sm"
      role="status"
    >
      <UIcon name="i-ph-cursor-click" class="text-primary size-4 shrink-0" />
      <span class="text-highlighted">
        {{ t("dms.agenda.year.pick_last_day") }}
      </span>
      <span class="text-muted">
        {{
          t("dms.agenda.year.from_day", {
            day: state.numericDay(ctx.rangeAnchor.value.day),
          })
        }}
      </span>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        class="ms-auto"
        :label="t('dms.agenda.year.cancel_range')"
        @click="cancelRange"
      />
    </div>
    <div
      ref="scroller"
      class="relative min-h-0 flex-1 overflow-auto overscroll-contain"
      :aria-label="t('dms.agenda.year.label')"
      @pointerleave="state.hover(null)"
    >
      <AgendaYearPlanner
        v-if="ctx.view.value.yearLayout !== 'months'"
        :state="state"
        :locale="ctx.format.locale.value"
      />
      <AgendaYearMonths
        v-else
        :state="state"
        :locale="ctx.format.locale.value"
        :week-starts-on="ctx.options.value.weekStartsOn"
        :week-numbers="!!ctx.options.value.raw.weekNumbers"
        :month-label="ctx.format.month"
      />
    </div>
  </div>
</template>
