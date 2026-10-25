<script setup lang="ts">
import { parseDate } from "@internationalized/date";
import { computed, ref } from "vue";
import DmsCalendar from "../../../components/form/components/Calendar.vue";
import AgendaViewSwitcher from "./AgendaViewSwitcher.vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import type { ResolvedAgendaToolbar } from "../../composables/agenda/agendaShell";
import type {
  AgendaFacet,
  AgendaToolbarAction,
} from "../../../types/full-agenda";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The toolbar of the agenda: title, Today, ‹ ›, the period (a calendar to
 * jump to a day with `datePicker`), the views, search, facets, the create
 * button, toolbar actions, refresh, ICS export and the sidebar button. It
 * wraps onto more lines in a narrow container.
 */
interface AgendaToolbarProps {
  parts: ResolvedAgendaToolbar;
  switcher: "none" | "segmented" | "select";
  /** A sidebar exists: offer its button. */
  hasSidebar: boolean;
  /** The sidebar shows (column or sheet): the button reads pressed. */
  sidebarShown: boolean;
}

const props = defineProps<AgendaToolbarProps>();
const emit = defineEmits<{
  "toggle-sidebar": [];
  create: [];
  "export-ics": [];
}>();

const ctx = useAgendaContext();
// The calendar takes a date value; it answers ISO days.
const anchorDate = computed(() => parseDate(ctx.anchor.value));
const { t } = useI18n();
const { processText } = useComposedText();

const raw = computed(() => ctx.options.value.raw);
const title = computed(() =>
  props.parts.title && raw.value.title ? processText(raw.value.title) : "",
);
const description = computed(() =>
  props.parts.title && raw.value.description
    ? processText(raw.value.description)
    : "",
);
const createOptions = computed(() =>
  typeof raw.value.create === "object" ? raw.value.create : {},
);
const canCreate = computed(
  () => ctx.options.value.canCreate && createOptions.value.button !== false,
);
const createLabel = computed(() =>
  createOptions.value.buttonLabel
    ? processText(createOptions.value.buttonLabel)
    : t("dms.agenda.toolbar.new"),
);
const toolbarActions = computed(() => ctx.options.value.toolbarActions);
const facets = computed(() => raw.value.facets ?? []);
const hasHeader = computed(
  () =>
    Boolean(title.value || description.value) ||
    toolbarActions.value.length > 0 ||
    canCreate.value,
);

const period = computed(() => ctx.format.title.value);
const pickerOpen = ref(false);
const pickDay = (day: unknown) => {
  if (typeof day !== "string") return;
  pickerOpen.value = false;
  ctx.goTo(day);
};

/** A facet's choices as the select menu lists them. */
interface FacetItem {
  label: string;
  value: string;
  icon?: string;
}

const facetItems = (facet: AgendaFacet): FacetItem[] =>
  facet.options.map((option) => ({
    label: processText(option.label),
    value: option.value,
    icon: option.icon,
  }));
const facetValue = (facet: AgendaFacet) => {
  const values = ctx.facetValues.value[facet.id] ?? [];
  return facet.multiple ? values : values[0];
};
const setFacet = (facet: AgendaFacet, value: unknown) => {
  const values = Array.isArray(value)
    ? value.map(String)
    : value === undefined || value === null || value === ""
      ? []
      : [String(value)];
  ctx.facetValues.value = { ...ctx.facetValues.value, [facet.id]: values };
};

const actionColor = (action: AgendaToolbarAction) => action.tone ?? "neutral";

/** How a save in `immediate` mode stands, beside the period. */
interface SaveStatusBadge {
  label: string;
  icon: string;
  class: string;
}

/** How each save status is drawn: its text key, icon and colour. */
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
const saveStatus = computed<SaveStatusBadge | null>(() => {
  if (raw.value.saveMode === "staged") return null;
  const status = ctx.saveStatus.value;
  const badge = SAVE_STATUS[status];
  return badge
    ? { icon: badge.icon, class: badge.class, label: t(badge.key) }
    : null;
});
</script>

<template>
  <div class="border-default border-b" data-agenda-toolbar>
    <div
      v-if="hasHeader"
      class="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 pt-3"
    >
      <div v-if="title || description" class="min-w-0 flex-1">
        <h2
          v-if="title"
          class="text-highlighted truncate text-base font-semibold"
        >
          {{ title }}
        </h2>
        <p v-if="description" class="text-muted text-sm">{{ description }}</p>
      </div>
      <div class="ms-auto flex flex-wrap items-center gap-2">
        <UButton
          v-for="action in toolbarActions"
          :key="action.id"
          :label="processText(action.label)"
          :icon="action.icon"
          :color="actionColor(action)"
          variant="outline"
          size="sm"
          @click="ctx.runToolbarAction(action)"
        />
        <UButton
          v-if="canCreate"
          icon="i-ph-plus"
          size="sm"
          :label="createLabel"
          data-agenda-create
          @click="emit('create')"
        />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <UTooltip v-if="props.hasSidebar" :text="t('dms.agenda.toolbar.sidebar')">
        <UButton
          icon="i-ph-sidebar-simple"
          size="sm"
          color="neutral"
          :variant="props.sidebarShown ? 'soft' : 'ghost'"
          :aria-label="t('dms.agenda.toolbar.sidebar')"
          :aria-pressed="props.sidebarShown"
          data-agenda-sidebar-toggle
          @click="emit('toggle-sidebar')"
        />
      </UTooltip>
      <UButton
        v-if="props.parts.today"
        size="sm"
        color="neutral"
        variant="outline"
        :label="t('dms.agenda.toolbar.today')"
        @click="ctx.goToday()"
      />
      <div v-if="props.parts.navigation" class="flex items-center">
        <UButton
          icon="i-ph-caret-left"
          size="sm"
          color="neutral"
          variant="ghost"
          :disabled="!ctx.canGoPrevious.value"
          :aria-label="t('dms.agenda.toolbar.previous')"
          @click="ctx.go(-1)"
        />
        <UButton
          icon="i-ph-caret-right"
          size="sm"
          color="neutral"
          variant="ghost"
          :disabled="!ctx.canGoNext.value"
          :aria-label="t('dms.agenda.toolbar.next')"
          @click="ctx.go(1)"
        />
      </div>
      <UPopover v-if="props.parts.datePicker" v-model:open="pickerOpen">
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          trailing-icon="i-ph-caret-down"
          class="text-highlighted font-semibold"
          :label="period"
          :aria-label="
            t('dms.agenda.toolbar.pick_date', {
              period: period,
            })
          "
          data-agenda-period-picker
        />
        <template #content>
          <DmsCalendar
            class="p-2"
            :model-value="anchorDate"
            :week-starts-on="ctx.options.value.weekStartsOn"
            :min-date="raw.minDate"
            :max-date="raw.maxDate"
            @update:model-value="pickDay"
          />
        </template>
      </UPopover>
      <h3
        v-else
        class="text-highlighted text-sm font-semibold"
        aria-live="polite"
        data-agenda-period
      >
        {{ period }}
      </h3>
      <span v-if="props.parts.datePicker" class="sr-only" aria-live="polite">
        {{ period }}
      </span>
      <span
        v-if="saveStatus"
        :class="['inline-flex items-center gap-1 text-xs', saveStatus.class]"
        role="status"
        data-agenda-save-status
      >
        <UIcon :name="saveStatus.icon" class="size-3.5" />
        {{ saveStatus.label }}
      </span>

      <div class="ms-auto flex flex-wrap items-center gap-2">
        <UInput
          v-if="raw.search"
          v-model="ctx.search.value"
          icon="i-ph-magnifying-glass"
          size="sm"
          class="w-full @md:w-52"
          :placeholder="t('dms.agenda.toolbar.search')"
          :aria-label="t('dms.agenda.toolbar.search')"
        />
        <USelectMenu
          v-for="facet in facets"
          :key="facet.id"
          :model-value="facetValue(facet)"
          :items="facetItems(facet)"
          value-key="value"
          :multiple="facet.multiple"
          :placeholder="processText(facet.label)"
          :aria-label="processText(facet.label)"
          size="sm"
          class="min-w-36"
          @update:model-value="setFacet(facet, $event)"
        />
        <AgendaViewSwitcher
          v-if="props.switcher !== 'none'"
          :mode="props.switcher"
        />
        <UTooltip
          v-if="props.parts.refresh"
          :text="t('dms.agenda.toolbar.refresh')"
        >
          <UButton
            icon="i-ph-arrows-clockwise"
            size="sm"
            color="neutral"
            variant="ghost"
            :loading="ctx.loading.value"
            :aria-label="t('dms.agenda.toolbar.refresh')"
            @click="ctx.refresh()"
          />
        </UTooltip>
        <UTooltip
          v-if="props.parts.exportIcs"
          :text="t('dms.agenda.toolbar.export_ics')"
        >
          <UButton
            icon="i-ph-download-simple"
            size="sm"
            color="neutral"
            variant="ghost"
            :aria-label="t('dms.agenda.toolbar.export_ics')"
            @click="emit('export-ics')"
          />
        </UTooltip>
      </div>
    </div>
    <slot />
  </div>
</template>
