<script setup lang="ts">
import { computed, useId } from "vue";
import AgendaDetailsView from "./AgendaDetailsView.vue";
import AgendaEventForm from "./AgendaEventForm.vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { useAgendaDetails } from "../../composables/agenda/useAgendaDetails";
import type { AgendaContext } from "../../composables/agenda/agendaModel";

/**
 * The details of the open event (`ctx.details`): its read view, or the form
 * of the event or of a new one. The body of the details drawer and modal
 * (which hand it the agenda as `context`: a modal does not inherit the
 * block's provides) and of the popover, which also draws a header with
 * its title and a close button.
 */
interface AgendaDetailsProps {
  context?: AgendaContext;
  surface?: "drawer" | "modal" | "popover";
  /** Given by the drawer or modal it renders in. */
  containerId?: string;
}

const props = withDefaults(defineProps<AgendaDetailsProps>(), {
  context: undefined,
  surface: "drawer",
  containerId: undefined,
});

const ctx = props.context ?? useAgendaContext();
const details = useAgendaDetails(ctx);
const { t } = useI18n();
const formId = `agenda-form-${useId()}`;

const hasHeader = computed(() => props.surface === "popover");
const title = computed(() =>
  details.occurrence.value
    ? details.occurrence.value.event.title
    : t("dms.agenda.details.new_event"),
);
const isEditing = computed(
  () => details.state.value?.mode === "edit" || details.isNew.value,
);
const formKey = computed(() => details.occurrence.value?.key ?? "new");
</script>

<template>
  <div
    v-if="details.state.value"
    class="flex min-h-0 flex-col"
    :data-agenda-details="props.surface"
  >
    <div
      v-if="hasHeader"
      class="border-default flex items-start gap-2 border-b px-4 py-3"
    >
      <h3
        class="text-highlighted min-w-0 flex-1 text-base font-semibold break-words"
      >
        {{ title }}
      </h3>
      <UButton
        icon="i-ph-x"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="t('dms.agenda.details.close')"
        @click="details.close()"
      />
    </div>
    <div :class="hasHeader ? 'min-h-0 overflow-y-auto p-4' : ''">
      <AgendaEventForm
        v-if="isEditing"
        :key="formKey"
        :details="details"
        :form-id="formId"
      />
      <AgendaDetailsView
        v-else-if="details.occurrence.value"
        :ctx="ctx"
        :details="details"
        :occurrence="details.occurrence.value"
      />
    </div>
  </div>
</template>
