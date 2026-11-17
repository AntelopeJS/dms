<script setup lang="ts">
import { useAgendaPrintPage } from "../../build/composables/agenda/useAgendaPrintPage";
import AgendaFrame from "../../build/components/agenda/AgendaFrame.vue";
import { useAgenda } from "../../build/composables/agenda/useAgenda";
import { useComponentEvent } from "../../../../dms-core/app/composables/components/useComponentEvent";
import { useWatch } from "../../../../dms-core/app/composables/watch/useWatch";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import type { FullAgendaOptions } from "../../types/full-agenda";

interface FullAgendaBlockProps
  extends DefaultComponentProps,
    FullAgendaOptions {}

const props = withDefaults(defineProps<FullAgendaBlockProps>(), {
  nowIndicator: undefined,
  allDayRow: undefined,
  weekNumbers: undefined,
  tooltips: undefined,
  editable: undefined,
  dragMove: undefined,
  dragResize: undefined,
  copyOnAltDrag: undefined,
  create: undefined,
  review: undefined,
  toolbar: undefined,
  sidebar: undefined,
  legend: undefined,
  search: undefined,
  urlState: undefined,
  shortcuts: undefined,
});

useComponentEvent(props.componentId);
const { state: watchState } = useWatch(
  props.watchActions || [],
  props.componentId,
);

useAgendaPrintPage();
useAgenda(props, () => JSON.stringify(watchState.value));
</script>

<template>
  <AgendaFrame :options="props" />
</template>
