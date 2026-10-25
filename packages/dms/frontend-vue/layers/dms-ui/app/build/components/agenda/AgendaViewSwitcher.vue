<script setup lang="ts">
import { computed } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { compactAgendaView } from "../../composables/agenda/agendaRange";

/**
 * The views of the agenda: segments on a wide toolbar, a select on a narrow
 * one, showing the view drawn. A compact agenda draws another view for a
 * wide grid (a week as its day): it does not offer a view that would only
 * draw another one of the list.
 */
interface AgendaViewSwitcherProps {
  mode: "segmented" | "select";
}

const props = defineProps<AgendaViewSwitcherProps>();
const ctx = useAgendaContext();
const { t } = useI18n();

/** A view as the switcher offers it. */
interface ViewItem {
  label: string;
  value: string;
}

const offered = computed(() => {
  const views = ctx.views.value;
  if (!ctx.compact.value) return views;
  const compactView = ctx.options.value.raw.responsive?.compactView;
  return views.filter((view) => {
    const drawn = compactAgendaView(view, views, compactView);
    return drawn.id === view.id || !views.some((item) => item.id === drawn.id);
  });
});
const items = computed<ViewItem[]>(() =>
  offered.value.map((view) => ({ label: view.label, value: view.id })),
);
/** The view drawn when the switcher offers it, else the one picked (drawn compact). */
const value = computed(() => {
  const drawn = ctx.view.value.id;
  return offered.value.some((view) => view.id === drawn)
    ? drawn
    : ctx.pickedViewId.value;
});
const label = computed(() => t("dms.agenda.toolbar.view"));
</script>

<template>
  <DmsSegmented
    v-if="props.mode === 'segmented'"
    :model-value="value"
    :items="items"
    :aria-label="label"
    size="sm"
    data-agenda-view-switcher="segmented"
    @update:model-value="ctx.setView(String($event))"
  />
  <USelect
    v-else
    :model-value="value"
    :items="items"
    value-key="value"
    size="sm"
    class="min-w-28"
    :aria-label="label"
    data-agenda-view-switcher="select"
    @update:model-value="ctx.setView(String($event))"
  />
</template>
