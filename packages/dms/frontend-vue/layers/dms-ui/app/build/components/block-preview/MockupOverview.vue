<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  useTemplateRef,
  watch,
} from "vue";
import type { MockupOverview } from "../../composables/block-preview/useMockupOverview";
import type { MockupPins } from "../../composables/block-preview/useMockupPins";
import type { PreviewRect } from "../../utils/blockPreviewMessages";
import type {
  MockupCategory,
  MockupDataMode,
  MockupPageState,
} from "../../utils/mockup";
import { mockupPageIcon } from "../../utils/mockupFrame";
import {
  OVERVIEW_FRAME_WIDTH,
  wheelPixels,
  wheelZoomFactor,
} from "../../utils/mockupOverview";
import { readsRealData } from "../../utils/mockupRealData";
import { isFieldKey } from "../../utils/mockupShortcuts";
import { overviewArrows, shownArrows } from "../../utils/mockupOverviewArrows";
import MockupOverviewSlot from "./MockupOverviewSlot.vue";
import MockupPinLayer from "./MockupPinLayer.vue";
import MockupShortcutTip from "./MockupShortcutTip.vue";

/**
 * The Overview: every page of the mockup side by side, each a frame at its
 * real size with its title and its open comments above it, on a canvas that
 * pans with Space and a drag, a middle-button drag, the wheel or the arrow
 * keys, and zooms around the pointer with Ctrl or ⌘ and the wheel, or a
 * pinch. A mockup with sections lays each section's frames out in rows of
 * their own, under the section's title. The frames near the view are drawn live with their pins, which the
 * Comment tool adds to; the others wait as placeholders. Nothing is edited
 * here. A frame hovered, or picked with a click, is outlined and shows Open,
 * which opens its page, as a double-click on it or Enter on it focused do.
 * One arrow joins two pages that link: solid, with a head at each end when
 * they link both ways, and dashed from a parent to a sub-page it does not
 * link to. Every arrow shows at all times. While a page is hovered or picked,
 * its arrows are drawn stronger and over the others, which dim. They are laid
 * out once per layout, in the frames' own pixels, so a pan or a zoom moves
 * them with the frames.
 */
const props = defineProps<{
  overview: MockupOverview;
  pins: MockupPins;
  pages: readonly MockupPageState[];
  /** The sidebar's sections. */
  categories: readonly MockupCategory[];
  /** The mockup's title, which each preview's top bar shows when a page has none. */
  navigationTitle: string;
  /** The developer's Real data choice, if any: each page draws by it. */
  dataMode?: MockupDataMode;
}>();

const emit = defineEmits<{ open: [page: string] }>();

const ARROW_PAN_PX = 80;
const ARROW_PAN_FAST_PX = 400;
/** Which way each arrow key moves the canvas: the view moves the arrow's way. */
const ARROWS = new Map<string, readonly [number, number]>([
  ["ArrowLeft", [1, 0]],
  ["ArrowRight", [-1, 0]],
  ["ArrowUp", [0, 1]],
  ["ArrowDown", [0, -1]],
]);
const MIDDLE_BUTTON = 1;

const { t } = useI18n();
const viewport = useTemplateRef<HTMLElement>("viewport");
const isSpaceHeld = ref(false);
const hovered = ref<string>();
const picked = ref<string>();
const markerId = useId();
const panning = ref<{ pointerId: number; x: number; y: number }>();

const camera = computed(() => props.overview.camera.value);
const zoom = computed(() => camera.value.zoom);
const worldStyle = computed(() => ({
  transform: `translate(${camera.value.x}px, ${camera.value.y}px) scale(${zoom.value})`,
}));
/** Draws a label at its own size on the screen, however far the canvas is zoomed out: one frame wide, above it. */
const labelStyle = computed(() => ({
  width: `${OVERVIEW_FRAME_WIDTH * zoom.value}px`,
  transform: `scale(${1 / zoom.value})`,
  transformOrigin: "bottom left",
}));
const lineStyle = computed(() => ({ "--dms-line": `${1 / zoom.value}px` }));
/** Draws a section's title at its own size on the screen, above its first row's page titles. */
const sectionStyle = computed(() => ({
  width: `${OVERVIEW_FRAME_WIDTH * 2 * zoom.value}px`,
  transform: `scale(${1 / zoom.value})`,
  transformOrigin: "bottom left",
}));

const pageById = computed(
  () => new Map(props.pages.map((page) => [page.id, page])),
);
const iconById = computed(
  () =>
    new Map(
      props.pages.map((page, index) => [page.id, mockupPageIcon(page, index)]),
    ),
);
const blocksById = computed(
  () =>
    new Map(
      props.overview.canvases.value.map(({ page, blocks }) => [
        page.id,
        blocks,
      ]),
    ),
);
const frameById = computed(
  () => new Map(props.overview.frames.value.map((frame) => [frame.id, frame])),
);
/** Each live slot with the page it draws and that page's frame; a slot whose page left the mockup draws nothing. */
const slots = computed(() =>
  props.overview.slots.value.map((id, index) => ({
    index,
    page: id === undefined ? undefined : pageById.value.get(id),
    frame: id === undefined ? undefined : frameById.value.get(id),
  })),
);
const live = computed(
  () =>
    new Set(
      slots.value.flatMap(({ page, frame }) =>
        page && frame ? [page.id] : [],
      ),
    ),
);
/** The page of the pin being written or of the open card: its frame comes to the front, so the card shows over the frame beside it. */
const raised = computed(
  () =>
    props.pins.draft.value?.page ??
    props.pins.drawn.value.find(
      (pin) => pin.note.id === props.pins.openId.value,
    )?.page,
);

const arrows = computed(() =>
  overviewArrows(props.overview.frames.value, props.pages),
);
const shown = computed(() =>
  shownArrows(arrows.value, hovered.value ?? picked.value),
);

/** A frame focused with Tab is panned into view, and picked: its arrows stand out. */
function focusFrame(id: string): void {
  props.overview.reveal(id);
  picked.value = id;
}

/** The title of the page `id` is a sub-page of, which its frame's title names first. */
function parentTitle(id: string): string | undefined {
  const parent = pageById.value.get(id)?.parent;
  return parent === undefined ? undefined : pageById.value.get(parent)?.title;
}

function rectStyle(rect: PreviewRect) {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  const box = viewport.value?.getBoundingClientRect();
  const moved = wheelPixels(event, {
    width: box?.width ?? 0,
    height: box?.height ?? 0,
  });
  if (event.ctrlKey || event.metaKey) {
    props.overview.zoomBy(wheelZoomFactor(moved.y), {
      x: event.clientX,
      y: event.clientY,
    });
  } else {
    props.overview.panBy(-moved.x, -moved.y);
  }
}

/** Whether a press is on the canvas itself or a frame, which leave the focus to the canvas, rather than on a pin or a card. */
function isOnCanvas(target: EventTarget | null): boolean {
  return (
    target === viewport.value ||
    (target instanceof Element &&
      target.closest("[data-dms-mockup-overview-frame]") !== null)
  );
}

function onPointerDown(event: PointerEvent): void {
  if (isOnCanvas(event.target)) viewport.value?.focus({ preventScroll: true });
  if (event.target === viewport.value) picked.value = undefined;
  const isPan =
    event.button === MIDDLE_BUTTON || (event.button === 0 && isSpaceHeld.value);
  if (!isPan) return;
  event.preventDefault();
  viewport.value?.setPointerCapture?.(event.pointerId);
  panning.value = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  };
}

function onPointerMove(event: PointerEvent): void {
  const from = panning.value;
  if (!from || from.pointerId !== event.pointerId) return;
  props.overview.panBy(event.clientX - from.x, event.clientY - from.y);
  panning.value = { ...from, x: event.clientX, y: event.clientY };
}

function stopPanning(event: PointerEvent): void {
  if (panning.value?.pointerId === event.pointerId) panning.value = undefined;
}

function onKeydown(event: KeyboardEvent): void {
  const direction = ARROWS.get(event.key);
  if (!direction || isFieldKey(event.target) || event.altKey) return;
  event.preventDefault();
  const distance = event.shiftKey ? ARROW_PAN_FAST_PX : ARROW_PAN_PX;
  props.overview.panBy(direction[0] * distance, direction[1] * distance);
}

function onSpace(event: KeyboardEvent): void {
  if (event.code !== "Space" || isFieldKey(event.target)) return;
  event.preventDefault();
  isSpaceHeld.value = event.type === "keydown";
}

function releaseSpace(): void {
  isSpaceHeld.value = false;
}

watch(viewport, (element) => props.overview.attach(element), {
  immediate: true,
});

onMounted(() => {
  viewport.value?.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onSpace);
  window.addEventListener("keyup", onSpace);
  window.addEventListener("blur", releaseSpace);
  viewport.value?.focus({ preventScroll: true });
});

onBeforeUnmount(() => {
  viewport.value?.removeEventListener("wheel", onWheel);
  window.removeEventListener("keydown", onSpace);
  window.removeEventListener("keyup", onSpace);
  window.removeEventListener("blur", releaseSpace);
  props.overview.attach(null);
});
</script>

<template>
  <div
    ref="viewport"
    tabindex="0"
    role="region"
    class="bg-muted touch-none overflow-clip outline-none select-none"
    :aria-label="t('dms.mockup.overview_canvas')"
    data-dms-mockup-overview
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="stopPanning"
    @pointercancel="stopPanning"
    @keydown="onKeydown"
  >
    <div
      class="absolute top-0 left-0 origin-top-left"
      :style="[worldStyle, lineStyle]"
      data-dms-mockup-overview-world
    >
      <div
        v-for="frame in overview.frames.value"
        :key="frame.id"
        class="dms-overview-frame absolute rounded-md outline-none"
        :style="rectStyle(frame.rect)"
        role="button"
        tabindex="0"
        :aria-label="
          t('dms.mockup.overview_open', {
            title: pageById.get(frame.id)?.title ?? frame.id,
          })
        "
        :data-dms-mockup-overview-frame="frame.id"
        :data-live="live.has(frame.id) || undefined"
        :data-picked="picked === frame.id || undefined"
        @mousedown.prevent
        @click="picked = frame.id"
        @dblclick="emit('open', frame.id)"
        @keydown.enter.prevent="emit('open', frame.id)"
        @focus="focusFrame(frame.id)"
        @pointerenter="hovered = frame.id"
        @pointerleave="hovered = undefined"
      >
        <div class="absolute bottom-full left-0" :style="labelStyle">
          <div class="flex items-center gap-2 overflow-hidden pb-2 text-xs">
            <UIcon
              v-if="iconById.get(frame.id)"
              :name="iconById.get(frame.id)"
              class="text-muted size-3.5 shrink-0"
              data-dms-mockup-overview-title-icon
            />
            <span
              v-if="parentTitle(frame.id)"
              class="text-dimmed truncate"
              data-dms-mockup-overview-parent
            >
              {{ parentTitle(frame.id) }} ›
            </span>
            <span
              class="text-muted truncate font-medium"
              data-dms-mockup-overview-title
            >
              {{ pageById.get(frame.id)?.title }}
            </span>
            <UIcon
              v-if="pageById.get(frame.id)?.menu === false"
              name="i-ph-eye-slash"
              class="text-dimmed size-3.5 shrink-0"
              :aria-label="t('dms.mockup.page_hidden')"
              data-dms-mockup-overview-hidden
            />
            <span
              v-if="pins.openByPage.value.get(frame.id)"
              class="bg-primary text-inverted flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold"
              :aria-label="
                t(
                  'dms.mockup.open_comments',
                  { count: pins.openByPage.value.get(frame.id) },
                  pins.openByPage.value.get(frame.id) ?? 0,
                )
              "
              :data-dms-mockup-overview-count="frame.id"
            >
              <UIcon name="i-ph-chat-circle-dots-fill" class="size-3" />
              {{ pins.openByPage.value.get(frame.id) }}
            </span>
          </div>
        </div>
        <div
          v-if="!live.has(frame.id)"
          class="bg-default absolute inset-0 grid place-items-center rounded-md"
          data-dms-mockup-overview-placeholder
        >
          <div
            v-for="block in blocksById.get(frame.id)"
            :key="block.path"
            class="border-default bg-muted absolute rounded-sm border"
            :style="rectStyle(block.rect)"
            data-dms-mockup-overview-snapshot-block
          />
          <UIcon
            v-if="!blocksById.get(frame.id)?.length"
            :name="pageById.get(frame.id)?.icon ?? 'i-ph-frame-corners-light'"
            class="text-dimmed size-6"
            :style="{ transform: `scale(${1 / zoom})` }"
          />
        </div>
        <div
          v-if="hovered === frame.id || picked === frame.id"
          class="pointer-events-none absolute inset-0 z-20 grid place-items-center"
        >
          <UButton
            size="sm"
            icon="i-ph-arrow-square-out"
            class="pointer-events-auto shadow-md"
            tabindex="-1"
            :style="{ transform: `scale(${1 / zoom})` }"
            data-dms-mockup-overview-open
            @click="emit('open', frame.id)"
          >
            {{ t("dms.mockup.overview_open_button") }}
          </UButton>
        </div>
      </div>
      <div
        v-for="entry in overview.labels.value"
        :key="entry.label.category?.id ?? ''"
        class="pointer-events-none absolute left-0 h-0"
        :style="{ top: `${entry.y}px` }"
        :data-dms-mockup-overview-section="entry.label.category?.id ?? ''"
      >
        <div class="absolute bottom-full left-0" :style="sectionStyle">
          <div
            class="text-highlighted flex items-center gap-2 pb-10 text-base font-semibold"
          >
            <UIcon
              v-if="entry.label.category?.icon"
              :name="entry.label.category.icon"
              class="text-muted size-4 shrink-0"
            />
            <span class="truncate" data-dms-mockup-overview-section-title>
              {{
                entry.label.category?.title ?? t("dms.mockup.section_default")
              }}
            </span>
          </div>
        </div>
      </div>
      <svg
        v-if="shown.length"
        class="pointer-events-none absolute top-0 left-0 overflow-visible"
        width="1"
        height="1"
        aria-hidden="true"
        data-dms-mockup-overview-arrows
      >
        <defs>
          <marker
            v-for="kind in ['link', 'parent']"
            :id="`${markerId}-${kind}`"
            :key="kind"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              :class="`dms-overview-arrowhead-${kind}`"
            />
          </marker>
        </defs>
        <path
          v-for="arrow in shown"
          :key="`${arrow.from}:${arrow.to}`"
          :d="arrow.path"
          :class="`dms-overview-arrow dms-overview-arrow-${arrow.kind}`"
          :marker-end="`url(#${markerId}-${arrow.kind})`"
          :marker-start="
            arrow.isTwoWay ? `url(#${markerId}-${arrow.kind})` : undefined
          "
          :data-dms-mockup-overview-arrow="`${arrow.from}>${arrow.to}`"
          :data-kind="arrow.kind"
          :data-two-way="arrow.isTwoWay || undefined"
          :data-emphasis="arrow.emphasis"
        />
      </svg>
      <div
        v-for="slot in slots"
        v-show="slot.page && slot.frame"
        :key="slot.index"
        class="pointer-events-none absolute"
        :class="{ 'z-10': slot.page !== undefined && raised === slot.page.id }"
        :style="slot.frame && rectStyle(slot.frame.rect)"
        :data-dms-mockup-overview-slot="slot.page?.id"
      >
        <template v-if="slot.page && slot.frame">
          <MockupOverviewSlot
            :page="slot.page"
            :pages="pages"
            :categories="categories"
            :title="navigationTitle"
            :real-data="readsRealData(slot.page, dataMode)"
            :height="slot.frame.rect.height"
            @report="overview.report"
            @booted="overview.booted(slot.index)"
          />
          <MockupPinLayer :pins="pins" :page="slot.page.id" :scale="zoom" />
        </template>
      </div>
    </div>
    <div
      v-if="isSpaceHeld || panning"
      class="absolute inset-0 z-40"
      :class="panning ? 'cursor-grabbing' : 'cursor-grab'"
      data-dms-mockup-overview-pan
    />
    <div
      class="border-default bg-default absolute end-3 bottom-3 z-40 flex items-center gap-0.5 rounded-md border p-0.5 shadow-sm"
      role="group"
      :aria-label="t('dms.mockup.overview_zoom')"
      data-dms-mockup-overview-zoom
    >
      <MockupShortcutTip :label="t('dms.mockup.overview_zoom_out')">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-ph-minus"
          :aria-label="t('dms.mockup.overview_zoom_out')"
          data-dms-mockup-overview-zoom-out
          @click="overview.step(-1)"
        />
      </MockupShortcutTip>
      <span
        class="text-muted w-11 text-center text-xs tabular-nums"
        data-dms-mockup-overview-zoom-level
      >
        {{ Math.round(zoom * 100) }}%
      </span>
      <MockupShortcutTip :label="t('dms.mockup.overview_zoom_in')">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-ph-plus"
          :aria-label="t('dms.mockup.overview_zoom_in')"
          data-dms-mockup-overview-zoom-in
          @click="overview.step(1)"
        />
      </MockupShortcutTip>
      <MockupShortcutTip
        :label="t('dms.mockup.overview_fit')"
        shortcut="fit_all"
      >
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-ph-arrows-out"
          :aria-label="t('dms.mockup.overview_fit')"
          data-dms-mockup-overview-fit
          @click="overview.fitAll()"
        />
      </MockupShortcutTip>
    </div>
  </div>
</template>

<style scoped>
.dms-overview-frame {
  box-shadow: 0 0 0 var(--dms-line) var(--ui-border);
}

.dms-overview-frame:hover,
.dms-overview-frame[data-picked] {
  box-shadow: 0 0 0 calc(var(--dms-line) * 2) var(--ui-primary);
}

.dms-overview-arrow {
  fill: none;
  stroke-width: calc(var(--dms-line) * 2);
}

.dms-overview-arrow[data-emphasis="focused"] {
  stroke-width: calc(var(--dms-line) * 3);
}

.dms-overview-arrow[data-emphasis="dimmed"] {
  opacity: 0.35;
}

.dms-overview-arrow-link {
  stroke: var(--ui-primary);
}

.dms-overview-arrow-parent {
  stroke: var(--ui-text-muted);
  stroke-dasharray: calc(var(--dms-line) * 10) calc(var(--dms-line) * 6);
}

.dms-overview-arrowhead-link {
  fill: var(--ui-primary);
}

.dms-overview-arrowhead-parent {
  fill: var(--ui-text-muted);
}

.dms-overview-frame:focus-visible {
  box-shadow:
    0 0 0 calc(var(--dms-line) * 4) var(--ui-bg-muted),
    0 0 0 calc(var(--dms-line) * 6) var(--ui-primary);
}
</style>
