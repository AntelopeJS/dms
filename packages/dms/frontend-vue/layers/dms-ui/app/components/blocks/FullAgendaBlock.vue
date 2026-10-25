<script setup lang="ts">
import { computed } from "vue";
import DmsSaveBar from "../save-bar/SaveBar.vue";
import DmsBlockInlineStatus from "../../build/components/blocks/BlockInlineStatus.vue";
import AgendaDetailsHost from "../../build/components/agenda/AgendaDetailsHost.vue";
import AgendaLegend from "../../build/components/agenda/AgendaLegend.vue";
import AgendaSaveStatus from "../../build/components/agenda/AgendaSaveStatus.vue";
import AgendaSidebar from "../../build/components/agenda/AgendaSidebar.vue";
import AgendaToolbar from "../../build/components/agenda/AgendaToolbar.vue";
import AgendaViewHost from "../../build/components/agenda/AgendaViewHost.vue";
import { useAgenda } from "../../build/composables/agenda/useAgenda";
import { useAgendaShell } from "../../build/composables/agenda/useAgendaShell";
import { useAgendaHeight } from "../../build/composables/agenda/useAgendaHeight";
import { readFetchNotFound } from "../../build/utils/fetchNotFound";
import { useComponentEvent } from "../../../../dms-core/app/composables/components/useComponentEvent";
import { useWatch } from "../../../../dms-core/app/composables/watch/useWatch";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import type { FullAgendaOptions } from "../../types/full-agenda";

// `FullAgenda` block (interface-dms `base/full-agenda`): events on a time
// grid, a month, a timeline, a year or a list, with a toolbar, a sidebar and
// the details of an event. The state lives in `useAgenda` (the context the
// parts read), the shell's layout in `useAgendaShell`; this file lays out.
interface FullAgendaBlockProps
  extends DefaultComponentProps,
    FullAgendaOptions {}

// Every flag defaults to `undefined`, not `false`: the options read an
// absent flag as its own default (`editable` with a `saveUrl`, `urlState`).
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

const ctx = useAgenda(props, () => JSON.stringify(watchState.value));
const shell = useAgendaShell(ctx, props);
const { t } = useI18n();
const { processText } = useComposedText();
// Bound as the root's template ref: the context measures it.
const rootEl = ctx.rootEl;

const { height, rootClass, rootStyle } = useAgendaHeight(
  rootEl,
  () => props.height,
);

const hasError = computed(
  () =>
    !ctx.loading.value &&
    Boolean(ctx.error.value) &&
    ctx.occurrences.value.length === 0,
);
// A read that failed over events already shown: they stay, with a banner.
const hasStaleError = computed(
  () => !ctx.loading.value && Boolean(ctx.error.value) && !hasError.value,
);
const notFound = computed(() =>
  hasError.value ? readFetchNotFound(ctx.error.value) : null,
);
// The list view says it is empty itself.
const isEmpty = computed(
  () =>
    ctx.view.value.type !== "list" &&
    ctx.hasData.value &&
    !ctx.loading.value &&
    !hasError.value &&
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
// Without a toolbar, a folded sidebar keeps a button of its own.
// Without a toolbar, a slim strip keeps a way to a folded sidebar and the
// save status of an immediate agenda, above the views rather than over them.
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
// The sheet is modal: what lies outside it is out of reach while it is open.
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
      :inert="outsideSheet || undefined"
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
    />
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
          class="border-default flex items-center gap-2 border-b bg-(--dms-error-tint) px-4 py-1.5 text-xs"
          role="alert"
          data-agenda-stale-error
        >
          <UIcon name="i-ph-warning" class="text-error size-4 shrink-0" />
          <span class="text-error flex-1">
            {{ t("dms.agenda.toolbar.stale_error") }}
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
          :state="notFound ? 'not-found' : 'error'"
          :not-found="notFound"
          class="min-h-48 px-[18px]"
          @retry="ctx.refresh()"
        />
        <template v-else>
          <AgendaViewHost />
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
