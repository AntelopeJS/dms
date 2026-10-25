<script setup lang="ts">
import { computed } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";

/**
 * The views of the agenda: segments on a wide toolbar, a select on a narrow
 * one. Picks the view the switcher shows; a compact agenda may still draw
 * its compact view (`ctx.view`) until the container widens.
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

const items = computed<ViewItem[]>(() =>
  ctx.views.value.map((view) => ({ label: view.label, value: view.id })),
);
const label = computed(() => t("dms.agenda.toolbar.view"));
</script>

<template>
  <DmsSegmented
    v-if="props.mode === 'segmented'"
    :model-value="ctx.pickedViewId.value"
    :items="items"
    :aria-label="label"
    size="sm"
    data-agenda-view-switcher="segmented"
    @update:model-value="ctx.setView(String($event))"
  />
  <USelect
    v-else
    :model-value="ctx.pickedViewId.value"
    :items="items"
    value-key="value"
    size="sm"
    class="min-w-28"
    :aria-label="label"
    data-agenda-view-switcher="select"
    @update:model-value="ctx.setView(String($event))"
  />
</template>
