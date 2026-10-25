<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AgendaDetails from "./AgendaDetails.vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { AGENDA_PANEL_WIDTH } from "../../composables/agenda/agendaShell";
import type { AgendaDetailsState } from "../../composables/agenda/agendaModel";
import { useDrawer } from "../../../composables/containers/useDrawer";
import { useModal } from "../../../composables/containers/useModal";
import type { ContainerInstance } from "../../../composables/containers/types";
import type { AgendaDetailsContainer } from "../../../types/full-agenda";

/**
 * Where the details of the open event (`ctx.details`) show: a drawer
 * (`useDrawer`) or a modal (`useModal`) opened with `AgendaDetails` as their
 * body, a panel column beside the views, or a popover anchored on the
 * event's chip. Closing the container clears `ctx.details`; clearing it
 * closes the container. Focus goes back to what had it on opening.
 */
interface AgendaDetailsHostProps {
  /** The container, after the container width (a panel without room is a drawer). */
  container: AgendaDetailsContainer;
}

const props = defineProps<AgendaDetailsHostProps>();
const ctx = useAgendaContext();
const { t } = useI18n();
const { open: openDrawer } = useDrawer();
const { open: openModal } = useModal();

type OverlayKind = "drawer" | "modal";
let instance: ContainerInstance | null = null;
let instanceKind: OverlayKind | null = null;
let returnFocus: HTMLElement | null = null;
const anchor = ref<HTMLElement | null>(null);

const state = computed(() => ctx.details.value);
const titleOf = (open: AgendaDetailsState) =>
  open.occurrence?.event.title ?? t("dms.agenda.details.new_event");
const containerId = computed(
  () => `${ctx.pageId}-${ctx.componentId}-agenda-details`,
);

/** The chip of the open occurrence (views mark it), else what had focus. */
function chipOf(open: AgendaDetailsState): HTMLElement | null {
  const key = open.occurrence?.key;
  const root = ctx.rootEl.value;
  if (key && root) {
    const selector = `[data-agenda-occurrence="${CSS.escape(key)}"]`;
    const chip = root.querySelector<HTMLElement>(selector);
    if (chip) return chip;
  }
  return returnFocus;
}

function restoreFocus(): void {
  const target = returnFocus;
  returnFocus = null;
  if (target?.isConnected) target.focus();
}

function closeInstance(): void {
  const current = instance;
  instance = null;
  instanceKind = null;
  current?.close();
}

function openInstance(kind: OverlayKind, open: AgendaDetailsState): void {
  const options = {
    title: titleOf(open),
    component: AgendaDetails,
    componentOptions: { context: ctx, surface: kind },
    containerId: containerId.value,
  };
  const opened =
    kind === "drawer"
      ? openDrawer({ ...options, size: ctx.options.value.raw.details?.size })
      : openModal(options);
  instance = opened;
  instanceKind = kind;
  // Closed by its X, Esc or a click outside: the details close too.
  opened.result.finally(() => {
    if (instance !== opened) return;
    instance = null;
    instanceKind = null;
    ctx.closeDetails();
  });
}

function sync(
  open: AgendaDetailsState | null,
  container: AgendaDetailsContainer,
): void {
  if (!open) {
    closeInstance();
    anchor.value = null;
    restoreFocus();
    return;
  }
  if (!returnFocus && typeof document !== "undefined")
    returnFocus = document.activeElement as HTMLElement | null;
  if (container === "popover") anchor.value = chipOf(open);
  if (container !== "drawer" && container !== "modal") {
    closeInstance();
    return;
  }
  if (instance && instanceKind === container) {
    instance.patch({ title: titleOf(open) });
    return;
  }
  closeInstance();
  openInstance(container, open);
}

watch(
  [state, () => props.container],
  ([open, container]) => sync(open, container),
  { flush: "post" },
);
// Open on load (a deep link): containers open in the browser only.
onMounted(() => sync(state.value, props.container));
onBeforeUnmount(closeInstance);

const panelOpen = computed(
  () => props.container === "panel" && Boolean(state.value),
);
const popoverOpen = computed(
  () =>
    props.container === "popover" &&
    Boolean(state.value) &&
    Boolean(anchor.value),
);
const panelWidth = `${AGENDA_PANEL_WIDTH}px`;
const onPopover = (open: boolean) => {
  if (!open) ctx.closeDetails();
};
</script>

<template>
  <aside
    v-if="panelOpen"
    class="border-default bg-default flex min-h-0 shrink-0 flex-col border-s"
    :style="{ width: panelWidth }"
    :aria-label="t('dms.agenda.details.label')"
    data-agenda-details-panel
  >
    <AgendaDetails :context="ctx" surface="panel" class="min-h-0 flex-1" />
  </aside>
  <UPopover
    v-if="props.container === 'popover'"
    :open="popoverOpen"
    :reference="anchor ?? undefined"
    :content="{ side: 'right', align: 'start', collisionPadding: 12 }"
    @update:open="onPopover"
  >
    <template #content>
      <AgendaDetails
        :context="ctx"
        surface="popover"
        class="max-h-[70vh] w-80 max-w-[90vw]"
      />
    </template>
  </UPopover>
</template>
