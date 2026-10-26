<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AgendaDetails from "./AgendaDetails.vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { syncAgendaDraft } from "../../composables/agenda/useAgendaDetails";
import { attributeSelector } from "../../composables/agenda/agendaShell";
import type { AgendaDetailsState } from "../../composables/agenda/agendaModel";
import { useDrawer } from "../../../composables/containers/useDrawer";
import { useModal } from "../../../composables/containers/useModal";
import type { ContainerInstance } from "../../../composables/containers/types";
import type { AgendaDetailsContainer } from "../../../types/full-agenda";

/**
 * Where the details of the open event (`ctx.details`) show: a drawer on the
 * right (`useDrawer`) or a modal (`useModal`) opened with `AgendaDetails` as
 * their body, or a popover anchored on the event's chip. Closing the
 * container clears `ctx.details`; clearing it closes the container. Focus
 * goes back to what had it on opening.
 */
interface AgendaDetailsHostProps {
  /** The container, after the container width (a compact popover is a drawer). */
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
/** What a popover is placed against: an element, or a point (`getBoundingClientRect`). */
interface PopoverAnchor {
  getBoundingClientRect: () => DOMRect;
}

const anchor = ref<PopoverAnchor | null>(null);
const ANCHOR_TOP_OFFSET = 48;

const state = computed(() => ctx.details.value);
const titleOf = (open: AgendaDetailsState) =>
  open.occurrence?.event.title ?? t("dms.agenda.details.new_event");
const containerId = computed(
  () => `${ctx.pageId}-${ctx.componentId}-agenda-details`,
);

/** The chip of the open occurrence (views mark it), else what had focus. */
/**
 * The chip of the open occurrence (views mark it). Without one in the block
 * (a deep link before the view drew it, an event opened from the "+N more"
 * list, a new event), a point near the top of the agenda, never the page.
 */
function anchorOf(open: AgendaDetailsState): PopoverAnchor | null {
  const key = open.occurrence?.key;
  const root = ctx.rootEl.value;
  if (!root) return null;
  if (key) {
    const selector = attributeSelector("data-agenda-occurrence", key);
    const chip = root.querySelector<HTMLElement>(selector);
    if (chip) return chip;
  }
  return {
    getBoundingClientRect: () => {
      const box = root.getBoundingClientRect();
      return new DOMRect(
        box.left + box.width / 2,
        box.top + ANCHOR_TOP_OFFSET,
        0,
        0,
      );
    },
  };
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
      ? openDrawer({
          ...options,
          direction: "right",
          size: ctx.options.value.raw.details?.size,
        })
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
  syncAgendaDraft(ctx, open);
  if (!open) {
    closeInstance();
    anchor.value = null;
    restoreFocus();
    return;
  }
  if (!returnFocus && typeof document !== "undefined")
    returnFocus = document.activeElement as HTMLElement | null;
  if (container === "popover") anchor.value = anchorOf(open);
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

const popoverOpen = computed(
  () =>
    props.container === "popover" &&
    Boolean(state.value) &&
    Boolean(anchor.value),
);
const onPopover = (open: boolean) => {
  if (!open) ctx.closeDetails();
};
</script>

<template>
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
