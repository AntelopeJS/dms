<script setup lang="ts">
import { computed } from "vue";
import DmsSaveBar from "../../../components/save-bar/SaveBar.vue";
import DmsBlockInlineStatus from "../blocks/BlockInlineStatus.vue";
import AgendaDetailsHost from "./AgendaDetailsHost.vue";
import AgendaLegend from "./AgendaLegend.vue";
import AgendaSaveStatus from "./AgendaSaveStatus.vue";
import AgendaSidebar from "./AgendaSidebar.vue";
import AgendaToolbar from "./AgendaToolbar.vue";
import AgendaViewHost from "./AgendaViewHost.vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { useAgendaShell } from "../../composables/agenda/useAgendaShell";
import { useAgendaHeight } from "../../composables/agenda/useAgendaHeight";
import { daysBetween } from "../../composables/agenda/agendaTime";
import { readFetchNotFound } from "../../utils/fetchNotFound";
import { useComposedText } from "../../../../../dms-core/app/composables/translation/useComposedText";
import type { DefaultComponentProps } from "../../../../../dms-core/app/types/component";
import type { FullAgendaOptions } from "../../../types/full-agenda";

/** The options of the FullAgenda block, as the block received them. */
export interface AgendaFrameOptions
  extends DefaultComponentProps,
    FullAgendaOptions {}

/**
 * The FullAgenda block as it is laid out: its toolbar, sidebar, view,
 * details, save bar and states, over the agenda context its block provides.
 */
const { options: props } = defineProps<{ options: AgendaFrameOptions }>();

const ctx = useAgendaContext();
const shell = useAgendaShell(ctx, props);
const { t } = useI18n();
const { processText } = useComposedText();
const rootEl = ctx.rootEl;

const { height, rootClass, rootStyle } = useAgendaHeight(
  rootEl,
  () => props.height,
);

const hasError = computed(
  () =>
    !ctx.loading.value &&
    Boolean(ctx.error.value) &&
    !ctx.windowFailed.value &&
    ctx.occurrences.value.length === 0,
);
const hasStaleError = computed(
  () => !ctx.loading.value && Boolean(ctx.error.value) && !hasError.value,
);
const bandText = computed(() => {
  if (!ctx.windowFailed.value) return t("dms.agenda.toolbar.stale_error");
  const days = daysBetween(ctx.range.value.from, ctx.range.value.to) + 1;
  const key =
    days === 1
      ? "window_failed_day"
      : days === 7
        ? "window_failed_week"
        : "window_failed";
  return t(`dms.agenda.toolbar.${key}`);
});
const UNREAD_RANGE_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--ui-border) 0 1px, transparent 1px 10px)",
  backgroundColor: "color-mix(in oklab, var(--ui-bg) 70%, transparent)",
};
const notFound = computed(() =>
  hasError.value ? readFetchNotFound(ctx.error.value) : null,
);
const isEmpty = computed(
  () =>
    ctx.view.value.type !== "list" &&
    ctx.hasData.value &&
    !ctx.loading.value &&
    !hasError.value &&
    !ctx.windowFailed.value &&
    ctx.occurrences.value.length === 0,
);
const emptyLabel = computed(() =>
  props.emptyLabel
    ? processText(props.emptyLabel)
    : t("dms.agenda.toolbar.empty"),
);

const layout = computed(() => shell.layout.value);
const sidebarRight = computed(() => shell.sidebar.value?.position === "right");
const sidebarMode = computed(() =>
  layout.value.sidebar === "overlay" ? "overlay" : "column",
);
const showSidebar = computed(
  () => layout.value.sidebar === "column" || layout.value.sidebar === "overlay",
);
const legendAt = (position: "toolbar" | "bottom") =>
  shell.legend.value?.position === position;
const isDragging = computed(() => ctx.drag.active.value);
const showSidebarButton = computed(
  () =>
    !shell.toolbar.value &&
    Boolean(shell.sidebar.value) &&
    layout.value.sidebar === "folded",
);
const showsStripStatus = computed(
  () =>
    !shell.toolbar.value && ctx.editable.value && props.saveMode !== "staged",
);
const printDay = () => window.print();
const printDate = computed(() => {
  const { from, to } = ctx.range.value;
  return from === to ? ctx.format.day(from, "long") : ctx.format.title.value;
});
const outsideSheet = computed(() => layout.value.sidebar === "overlay");
</script>

<template>
  <div
    ref="rootEl"
    data-dms-full-agenda
    :data-component-id="props.componentId"
    :data-compact="ctx.compact.value || undefined"
    :data-density="props.density"
    :data-height="height.fill ? 'fill' : height.height"
    :class="[
      'dms-card @container relative flex min-w-0 flex-col overflow-hidden',
      rootClass,
    ]"
    :style="rootStyle"
    @keydown="shell.onKeydown"
  >
    <AgendaToolbar
      v-if="shell.toolbar.value"
      :sheet-open="outsideSheet"
      :parts="shell.toolbar.value"
      :switcher="layout.switcher"
      :has-sidebar="
        Boolean(shell.sidebar.value) &&
        (ctx.compact.value || shell.sidebar.value?.collapsible !== false)
      "
      :sidebar-shown="shell.sidebarShown.value"
      @toggle-sidebar="shell.toggleSidebar()"
      @create="ctx.createNew()"
      @export-ics="ctx.exportIcs()"
      @print="printDay"
    />
    <p
      class="text-highlighted hidden px-4 pb-2 text-sm font-semibold"
      data-agenda-print-date
    >
      {{ printDate }}
    </p>
    <AgendaLegend
      v-if="shell.legend.value && legendAt('toolbar')"
      :legend="shell.legend.value"
      :inert="outsideSheet || undefined"
      layout="inline"
      class="border-default border-b"
    />
    <div
      v-if="showSidebarButton || showsStripStatus"
      :class="[
        'border-default flex items-center gap-2 border-b px-2 py-1',
        sidebarRight && 'flex-row-reverse',
      ]"
      data-agenda-strip
    >
      <UButton
        v-if="showSidebarButton"
        icon="i-ph-sidebar-simple"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="t('dms.agenda.toolbar.sidebar')"
        data-agenda-sidebar-toggle
        @click="shell.toggleSidebar()"
      />
      <AgendaSaveStatus v-if="showsStripStatus" class="ms-auto" />
    </div>

    <div class="relative flex min-h-0 flex-1">
      <AgendaSidebar
        v-if="showSidebar && shell.sidebar.value"
        :sidebar="shell.sidebar.value"
        :sections="shell.sections.value"
        :legend="shell.legend.value"
        :mode="sidebarMode"
        :dragging="isDragging"
        @close="shell.overlayOpen.value = false"
        @fold="ctx.sidebarOpen.value = false"
      />

      <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          v-if="ctx.loading.value"
          class="bg-primary/60 absolute inset-x-0 top-0 z-20 h-0.5 animate-pulse"
          role="progressbar"
          :aria-label="t('dms.agenda.toolbar.loading')"
        />
        <div
          v-if="hasStaleError"
          class="border-default relative z-30 flex items-center gap-2 border-b bg-(--dms-error-tint) px-4 py-1.5 text-xs"
          role="alert"
          data-agenda-stale-error
        >
          <UIcon name="i-ph-warning" class="text-error size-4 shrink-0" />
          <span class="text-error flex-1">
            {{ bandText }}
          </span>
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            :label="t('dms.agenda.toolbar.retry')"
            @click="ctx.refresh()"
          />
        </div>
        <DmsBlockInlineStatus
          v-if="hasError"
          data-agenda-status
          :state="notFound ? 'not-found' : 'error'"
          :not-found="notFound"
          class="min-h-48 px-[18px]"
          @retry="ctx.refresh()"
        />
        <template v-else>
          <AgendaViewHost />
          <div
            v-if="ctx.windowFailed.value"
            class="absolute inset-0 z-20"
            :style="UNREAD_RANGE_STYLE"
            aria-hidden="true"
            data-agenda-window-failed
          />
          <p
            v-if="isEmpty"
            class="bg-default/90 text-muted border-default pointer-events-none absolute start-1/2 top-3 z-10 -translate-x-1/2 rounded-full border px-3 py-1 text-xs shadow-sm rtl:translate-x-1/2"
            role="status"
            data-agenda-empty
          >
            {{ emptyLabel }}
          </p>
        </template>
      </div>

      <AgendaDetailsHost :container="layout.details" />
    </div>

    <AgendaLegend
      v-if="shell.legend.value && legendAt('bottom')"
      :legend="shell.legend.value"
      layout="inline"
      class="border-default border-t"
    />
    <div
      v-if="shell.isStaged.value && shell.stagedCount.value > 0"
      :inert="outsideSheet || undefined"
      class="border-default border-t py-2 ps-[18px] pe-3.5"
      data-agenda-save-bar
    >
      <DmsSaveBar
        data-agenda-save-bar
        variant="band"
        dirty
        :saving="ctx.saving.value"
        :save-label="shell.saveLabel.value"
        @discard="ctx.discardStaged()"
        @save="shell.requestSave()"
      />
    </div>
    <p class="sr-only" aria-live="polite" data-agenda-live>
      {{ ctx.liveMessage.value }}
    </p>
    <p class="sr-only" aria-live="polite" data-agenda-drag-live>
      {{ ctx.drag.announcement.value }}
    </p>
  </div>
</template>

<style>
@media print {
  body:has([data-dms-full-agenda])
    *:not(:has([data-dms-full-agenda])):not([data-dms-full-agenda]):not(
      [data-dms-full-agenda] *
    ) {
    display: none !important;
  }

  body:has([data-dms-full-agenda]) :has([data-dms-full-agenda]) {
    display: block !important;
    position: static !important;
    inset: auto !important;
    width: auto !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    transform: none !important;
    border: 0 !important;
  }

  [data-dms-full-agenda] {
    position: static !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    border: 0;
    box-shadow: none;
    zoom: 0.9;
  }

  [data-dms-full-agenda] :has([data-agenda-time-grid]),
  [data-dms-full-agenda] [data-agenda-time-grid],
  [data-dms-full-agenda] [data-agenda-time-grid] > div {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
  }

  [data-dms-full-agenda] [data-agenda-print-date] {
    display: block !important;
  }

  [data-dms-full-agenda]
    [data-agenda-toolbar]
    > :not([data-agenda-toolbar-header]) {
    display: none !important;
  }

  [data-dms-full-agenda] button:not([data-agenda-occurrence]),
  [data-dms-full-agenda] [data-agenda-sidebar],
  [data-dms-full-agenda] [data-agenda-strip],
  [data-dms-full-agenda] [role="progressbar"] {
    display: none !important;
  }

  [data-dms-full-agenda] * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>
