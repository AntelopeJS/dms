<script setup lang="ts">
import { computed } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";

/**
 * How a write of an `immediate` agenda stands: "Saving…", "Saved", "Not
 * saved". The `role="status"` element stays in place, empty when there is
 * nothing to say, and only its text changes: screen readers announce a
 * change in a live region, not one inserted already filled.
 */
const ctx = useAgendaContext();
const { t } = useI18n();

/** How a status is drawn: its text key, icon and colour. */
interface SaveStatusStyle {
  key: string;
  icon: string;
  class: string;
}

const SAVE_STATUS: Record<string, SaveStatusStyle> = {
  saving: {
    key: "dms.agenda.save.saving",
    icon: "i-ph-circle-notch",
    class: "text-muted [&_svg]:animate-spin",
  },
  saved: {
    key: "dms.agenda.save.saved",
    icon: "i-ph-check",
    class: "text-success",
  },
  error: {
    key: "dms.agenda.details.status_error",
    icon: "i-ph-warning",
    class: "text-error",
  },
};

const style = computed(() => SAVE_STATUS[ctx.saveStatus.value]);
const label = computed(() => (style.value ? t(style.value.key) : ""));
</script>

<template>
  <span
    role="status"
    :class="['inline-flex items-center gap-1 text-xs', style?.class]"
    :data-status="ctx.saveStatus.value"
    data-agenda-save-status
  >
    <UIcon v-if="style" :name="style.icon" class="size-3.5" />
    {{ label }}
  </span>
</template>
