<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import AgendaLegend from "./AgendaLegend.vue";
import AgendaMiniCalendar from "./AgendaMiniCalendar.vue";
import AgendaNotices from "./AgendaNotices.vue";
import AgendaPendingList from "./AgendaPendingList.vue";
import AgendaUpcoming from "./AgendaUpcoming.vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import type {
  ResolvedAgendaLegend,
  ResolvedAgendaSidebar,
} from "../../composables/agenda/agendaShell";
import type { AgendaSidebarSection } from "../../../types/full-agenda";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The column beside the views (left or right), its sections in order: mini
 * calendar, calendars legend, resources, pending items, notices, upcoming,
 * tip. In a compact container it is a modal sheet over the agenda (focus
 * kept inside, given back on closing), closed by its X, Esc, a click beside
 * it, or once a day is picked or an event opened; it fades out of the way
 * while one of its items is dragged onto the agenda.
 */
interface AgendaSidebarProps {
  sidebar: ResolvedAgendaSidebar;
  sections: AgendaSidebarSection[];
  legend: ResolvedAgendaLegend | null;
  mode: "column" | "overlay";
  /** A drag is under way: the sheet lets the pointer reach the views. */
  dragging?: boolean;
}

// Its root is a fragment (backdrop + aside): attributes go to the aside.
defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<AgendaSidebarProps>(), {
  dragging: false,
});
const emit = defineEmits<{ close: []; fold: [] }>();

const ctx = useAgendaContext();
const { t } = useI18n();
const { processText } = useComposedText();

const isOverlay = computed(() => props.mode === "overlay");
const isRight = computed(() => props.sidebar.position === "right");
const width = computed(() => `${props.sidebar.width}px`);
const tip = computed(() =>
  props.sidebar.tip ? processText(props.sidebar.tip) : "",
);

const groupLabel = (groupId: string | undefined) => {
  const group = ctx.resourceGroups.value.find((item) => item.id === groupId);
  return group ? processText(group.label) : "";
};

// Sections keep their height and stack (`[&>*]:shrink-0` on the column):
// the column scrolls, they never overlap.
const asideClass = computed(() => {
  if (!isOverlay.value)
    return [
      "border-default",
      isRight.value ? "order-last border-s" : "border-e",
    ];
  return [
    "border-default absolute inset-y-0 z-40 max-w-[85%] shadow-xl",
    isRight.value ? "end-0 border-s" : "start-0 border-e",
    props.dragging && "pointer-events-none opacity-0",
  ];
});

const panelEl = ref<HTMLElement | null>(null);
let returnFocus: HTMLElement | null = null;
onMounted(async () => {
  if (!isOverlay.value) return;
  returnFocus = document.activeElement as HTMLElement | null;
  await nextTick();
  panelEl.value?.focus();
});
onBeforeUnmount(() => {
  if (returnFocus?.isConnected) returnFocus.focus();
});

// The sheet has done its job once a day is picked or an event opens.
watch([ctx.anchor, ctx.details], () => {
  if (isOverlay.value) emit("close");
});

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Tab stays inside the sheet. */
function trapTab(event: KeyboardEvent): void {
  if (!isOverlay.value || event.key !== "Tab" || !panelEl.value) return;
  const items = [...panelEl.value.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === panelEl.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div
    v-if="isOverlay && !props.dragging"
    class="absolute inset-0 z-30 bg-(--ui-bg)/60 backdrop-blur-[1px]"
    data-agenda-sidebar-backdrop
    @click="emit('close')"
  />
  <aside
    v-bind="$attrs"
    ref="panelEl"
    :aria-label="t('dms.agenda.sidebar.label')"
    :role="isOverlay ? 'dialog' : undefined"
    :aria-modal="isOverlay || undefined"
    :tabindex="isOverlay ? -1 : undefined"
    :data-agenda-sidebar="props.mode"
    :data-position="props.sidebar.position"
    :class="[
      'bg-default flex min-h-0 shrink-0 flex-col gap-5 overflow-y-auto p-4 outline-none [&>*]:shrink-0',
      asideClass,
    ]"
    :style="{ width }"
    @keydown.esc.stop="isOverlay && emit('close')"
    @keydown="trapTab"
  >
    <div
      v-if="isOverlay || props.sidebar.collapsible"
      class="-mb-3 flex justify-end"
    >
      <UButton
        :icon="isOverlay ? 'i-ph-x' : 'i-ph-sidebar-simple'"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="
          isOverlay
            ? t('dms.agenda.sidebar.close')
            : t('dms.agenda.sidebar.fold')
        "
        @click="isOverlay ? emit('close') : emit('fold')"
      />
    </div>
    <template v-for="section in props.sections" :key="section">
      <AgendaMiniCalendar
        v-if="section === 'miniCalendar'"
        @picked="isOverlay && emit('close')"
      />
      <AgendaLegend
        v-else-if="section === 'calendars' && props.legend"
        :legend="props.legend"
        layout="list"
      />
      <section
        v-else-if="section === 'resources' && ctx.resources.value.length"
        :aria-label="t('dms.agenda.sidebar.resources')"
        class="flex flex-col gap-1.5"
        data-agenda-resources
      >
        <h3 class="text-muted text-xs font-semibold tracking-wide uppercase">
          {{ t("dms.agenda.sidebar.resources") }}
        </h3>
        <ul class="flex flex-col gap-1">
          <li
            v-for="resource in ctx.resources.value"
            :key="resource.id"
            class="flex min-w-0 items-center gap-2 text-sm"
          >
            <UAvatar
              v-if="resource.avatar"
              size="2xs"
              :src="resource.avatar.src"
              :text="resource.avatar.initials"
              :alt="processText(resource.label)"
            />
            <span class="min-w-0 flex-1 truncate">
              {{ processText(resource.label) }}
            </span>
            <span v-if="resource.group" class="text-dimmed truncate text-xs">
              {{ groupLabel(resource.group) }}
            </span>
          </li>
        </ul>
      </section>
      <AgendaPendingList v-else-if="section === 'unscheduled'" />
      <AgendaNotices v-else-if="section === 'notices'" />
      <AgendaUpcoming v-else-if="section === 'upcoming'" />
      <p
        v-else-if="section === 'tip' && tip"
        class="text-muted bg-elevated/60 flex gap-2 rounded-md p-2.5 text-xs"
        data-agenda-tip
      >
        <UIcon name="i-ph-lightbulb" class="text-warning size-4 shrink-0" />
        <span>{{ tip }}</span>
      </p>
    </template>
  </aside>
</template>
