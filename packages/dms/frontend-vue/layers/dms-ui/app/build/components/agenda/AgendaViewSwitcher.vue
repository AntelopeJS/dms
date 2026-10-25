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

/** A view as the switcher offers it, and the view it draws. */
interface ViewItem {
  label: string;
  value: string;
  draws: string;
}

/**
 * The views offered. Compact, a wide grid draws another view: one of the
 * list is not offered twice; one made up for the width (a week drawn as
 * its day) is offered under the name of what it draws ("Day"), once.
 */
const items = computed<ViewItem[]>(() => {
  const views = ctx.views.value;
  if (!ctx.compact.value)
    return views.map((view) => ({
      label: view.label,
      value: view.id,
      draws: view.id,
    }));
  const compactView = ctx.options.value.raw.responsive?.compactView;
  const seen = new Set<string>();
  const result: ViewItem[] = [];
  for (const view of views) {
    const drawn = compactAgendaView(view, views, compactView);
    const isListed = views.some((item) => item.id === drawn.id);
    if (drawn.id !== view.id && isListed) continue;
    const madeUp = drawn.id !== view.id;
    const key = madeUp ? `made-up:${drawn.type}` : view.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      label: madeUp ? t(`dms.agenda.views.${drawn.type}`) : view.label,
      value: view.id,
      draws: drawn.id,
    });
  }
  return result;
});
/** The item of the view drawn, else the one picked. */
const value = computed(
  () =>
    items.value.find((item) => item.draws === ctx.view.value.id)?.value ??
    ctx.pickedViewId.value,
);
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
