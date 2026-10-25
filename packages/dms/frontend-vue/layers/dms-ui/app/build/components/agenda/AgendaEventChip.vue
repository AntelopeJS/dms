<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { AgendaOccurrence } from "../../composables/agenda/agendaModel";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import {
  STATE_ICONS,
  chipLabelExtras,
  chipClasses,
  chipPaintVars,
  issueTone,
  plainText,
  resolveEventContent,
  type AgendaChipLayout,
} from "../../composables/agenda/agendaChip";
import { describeWhen } from "../../composables/agenda/agendaDescribe";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * An event as every view draws it: a `block` of a time grid (title, time,
 * subtitle, place, badges, avatar as its height allows), a `bar` over days,
 * a `dot` and a time in a month cell, a `cell` of a year planner. It opens
 * its details, starts a move from its body and a resize from its edges,
 * moves with Alt+arrows, shows its save state, its issues on its edge, and a
 * tooltip. It never reads the pointer: the drag preview is the view's.
 */
interface AgendaEventChipProps {
  occurrence: AgendaOccurrence;
  layout?: AgendaChipLayout;
  /** The event runs on before / after this piece: a square edge, no resize handle. */
  continuesBefore?: boolean;
  continuesAfter?: boolean;
  /** Pixels of a block's height: a short block keeps its title and time on one line. */
  height?: number;
  /** Laid over another event (`overlap: "stack"`): an outline and a shadow keep it readable. */
  stacked?: boolean;
  /** In the tab order. A grid with a roving focus leaves all but one chip out. */
  tabbable?: boolean;
}

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<AgendaEventChipProps>(), {
  layout: "block",
  continuesBefore: false,
  continuesAfter: false,
  height: undefined,
  stacked: false,
  tabbable: true,
});

const ctx = useAgendaContext();
const { t } = useI18n();
const { processText } = useComposedText();

/** Under these heights a block drops its lower lines. */
const ONE_LINE_BELOW = 34;
const DETAILS_FROM = 52;
const BAR_BADGES = 2;

const raw = computed(() => ctx.options.value.raw);
const content = computed(() => resolveEventContent(raw.value.eventContent));
const event = computed(() => props.occurrence.event);
const calendarLabel = computed(() =>
  props.occurrence.calendar ? processText(props.occurrence.calendar.label) : "",
);
const isDragging = computed(
  () => ctx.drag.draggingKey.value === props.occurrence.key,
);
const ariaLabel = computed(() =>
  [
    ctx.describe(props.occurrence),
    ...chipLabelExtras(props.occurrence, t),
  ].join(", "),
);
const whenText = computed(() =>
  describeWhen(props.occurrence, {
    format: ctx.format,
    t,
    calendarLabel: () => "",
  }),
);
const timeText = computed(() =>
  props.occurrence.allDay
    ? ""
    : ctx.format.timeRange(props.occurrence.start, props.occurrence.end),
);
const startText = computed(() =>
  props.occurrence.allDay ? "" : ctx.format.time(props.occurrence.start),
);
const isShort = computed(
  () =>
    props.layout === "block" && (props.height ?? DETAILS_FROM) < ONE_LINE_BELOW,
);
const showDetails = computed(
  () =>
    props.layout === "block" && (props.height ?? DETAILS_FROM) >= DETAILS_FROM,
);
const resourceNames = computed(() =>
  content.value.resource
    ? ctx.resources.value
        .filter((resource) =>
          props.occurrence.resourceIds.includes(resource.id),
        )
        .map((resource) => processText(resource.label))
        .join(", ")
    : "",
);
const description = computed(() => plainText(event.value.description));
const issues = computed(() => event.value.issues ?? []);
const tone = computed(() => issueTone(event.value.issues));
const badges = computed(() => {
  const list = content.value.badges ? (event.value.badges ?? []) : [];
  return props.layout === "block" ? list : list.slice(0, BAR_BADGES);
});
const avatar = computed(() =>
  content.value.avatar ? event.value.avatar : undefined,
);
// Not tied to the drag: every chip would redraw at its start and its drop.
// A drag hides tooltips through the body's `data-agenda-dragging` instead.
const hasTooltip = computed(() => raw.value.tooltips !== false);
const TOOLTIP_UI = { content: "[[data-agenda-dragging]_&]:hidden" };
const isCompact = computed(() => raw.value.density === "compact");
const canResize = computed(
  () =>
    ctx.options.value.dragResize &&
    props.occurrence.canResize &&
    props.layout !== "dot" &&
    props.layout !== "cell",
);
const isVertical = computed(() => props.layout === "block");

const ROUNDED: Record<AgendaChipLayout, string> = {
  block: "rounded-md",
  bar: "rounded-md",
  dot: "rounded-md",
  cell: "rounded-sm",
};
const LAYOUT_CLASSES: Record<AgendaChipLayout, string> = {
  block: "flex-col items-stretch gap-0.5 px-1.5 py-1 text-xs leading-tight",
  bar: "items-center gap-1 px-1.5 text-xs leading-none",
  dot: "items-center gap-1.5 px-1 text-xs leading-none",
  cell: "items-center justify-center text-[10px] font-semibold leading-none",
};
/** `density: "compact"`: tighter paddings and a smaller text. */
const COMPACT_CLASSES: Record<AgendaChipLayout, string> = {
  block: "flex-col items-stretch gap-0 px-1 py-0.5 text-[11px] leading-tight",
  bar: "items-center gap-1 px-1 text-[11px] leading-none",
  dot: "items-center gap-1 px-0.5 text-[11px] leading-none",
  cell: "items-center justify-center text-[9px] font-semibold leading-none",
};
const hasEdgeBar = computed(
  () =>
    (props.layout === "block" || props.layout === "bar") &&
    ["soft", "dashed", undefined].includes(event.value.style),
);

const rootClasses = computed(() => [
  "group/chip relative flex size-full min-w-0 cursor-pointer overflow-hidden text-start select-none",
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--ui-primary)",
  ROUNDED[props.layout],
  (isCompact.value ? COMPACT_CLASSES : LAYOUT_CLASSES)[props.layout],
  props.stacked ? "shadow-md ring-1 ring-(--ui-bg)" : "",
  ...chipClasses(props.occurrence, props.layout),
  hasEdgeBar.value && !props.continuesBefore
    ? "border-s-3 border-(--agenda-bar)"
    : "",
  props.continuesBefore
    ? isVertical.value
      ? "rounded-t-none"
      : "rounded-s-none"
    : "",
  props.continuesAfter
    ? isVertical.value
      ? "rounded-b-none"
      : "rounded-e-none"
    : "",
  isDragging.value ? "opacity-40" : "",
]);

const openOn = computed(() => raw.value.details?.openOn ?? "click");

const chipEl = ref<HTMLElement | null>(null);
const isFocusedKey = computed(
  () => ctx.focusedKey.value === props.occurrence.key,
);

/**
 * The keyboard moved the agenda's focus to this event (arrows from another
 * chip): the browser's focus follows. A focus elsewhere (the toolbar) stays.
 */
watch(isFocusedKey, async (isFocused) => {
  if (!isFocused) return;
  await nextTick();
  const active = document.activeElement;
  const el = chipEl.value;
  if (!el || active === el || !active?.closest("[data-agenda-occurrence]")) {
    return;
  }
  el.focus();
});

function onFocusOut(): void {
  // Leaving the chips clears the focused event: no shortcut acts on it any more.
  if (isFocusedKey.value) ctx.focusedKey.value = null;
}

function onPointerDown(pointer: PointerEvent): void {
  // A press on a chip never starts a range on the surface under it.
  pointer.stopPropagation();
  if (pointer.pointerType === "mouse" && pointer.button !== 0) return;
  ctx.drag.startOccurrence(pointer, props.occurrence, "move");
}

function onResizeDown(
  pointer: PointerEvent,
  kind: "resizeStart" | "resizeEnd",
): void {
  pointer.stopPropagation();
  if (pointer.pointerType === "mouse" && pointer.button !== 0) return;
  ctx.drag.startOccurrence(pointer, props.occurrence, kind);
}

function onClick(click: MouseEvent): void {
  click.stopPropagation();
  if (openOn.value === "click") ctx.open(props.occurrence);
}

function onDoubleClick(click: MouseEvent): void {
  click.stopPropagation();
  if (openOn.value === "doubleClick") ctx.open(props.occurrence);
}

function onKeydown(key: KeyboardEvent): void {
  if (ctx.drag.nudge(key, props.occurrence)) {
    key.preventDefault();
    key.stopPropagation();
    return;
  }
  if (key.key !== "Enter" && key.key !== " ") return;
  key.preventDefault();
  ctx.open(props.occurrence);
}
</script>

<template>
  <UTooltip
    :disabled="!hasTooltip"
    :delay-duration="600"
    :ui="TOOLTIP_UI"
    :content="{ side: 'top', sideOffset: 4 }"
  >
    <button
      v-bind="$attrs"
      ref="chipEl"
      type="button"
      :class="rootClasses"
      :style="chipPaintVars(props.occurrence)"
      :aria-label="ariaLabel"
      :aria-roledescription="t('dms.agenda.grid.event')"
      :data-agenda-occurrence="props.occurrence.key"
      :data-state="props.occurrence.state"
      :tabindex="props.tabbable ? 0 : -1"
      @pointerdown="onPointerDown"
      @click="onClick"
      @dblclick="onDoubleClick"
      @keydown="onKeydown"
      @focus="ctx.focusedKey.value = props.occurrence.key"
      @focusout="onFocusOut"
    >
      <template v-if="props.layout === 'cell'">
        <span class="truncate px-0.5">
          {{ event.short ?? event.title.slice(0, 2) }}
        </span>
      </template>
      <template v-else-if="props.layout === 'dot'">
        <span
          class="size-2 shrink-0 rounded-full bg-(--agenda-bar)"
          aria-hidden="true"
        />
        <span
          v-if="content.time && startText"
          class="text-muted min-w-0 truncate tabular-nums"
        >
          {{ startText }}
        </span>
        <span class="max-w-full shrink-0 truncate font-medium">
          {{ event.title }}
        </span>
      </template>
      <template v-else>
        <span
          class="flex min-w-0 items-center gap-1"
          :class="isShort && 'flex-nowrap'"
        >
          <UIcon
            v-if="content.icon && event.icon"
            :name="event.icon"
            class="size-3.5 shrink-0"
          />
          <span
            v-if="
              props.layout === 'bar' &&
              content.time &&
              startText &&
              !props.continuesBefore
            "
            class="min-w-0 truncate tabular-nums opacity-80"
          >
            {{ startText }}
          </span>
          <!-- The title always wins: the time beside it gives way first. -->
          <span class="max-w-full shrink-0 truncate font-medium">
            {{ event.title }}
          </span>
          <span
            v-if="isShort && content.time && startText"
            class="min-w-0 truncate tabular-nums opacity-80"
          >
            {{ startText }}
          </span>
          <UIcon
            v-if="props.occurrence.state"
            :name="STATE_ICONS[props.occurrence.state]"
            class="ms-auto size-3.5 shrink-0"
            :class="props.occurrence.state === 'saving' && 'animate-spin'"
          />
          <UIcon
            v-if="tone"
            name="i-ph-warning"
            class="size-3.5 shrink-0"
            :class="[
              tone === 'error' ? 'text-error' : 'text-warning',
              !props.occurrence.state && 'ms-auto',
            ]"
          />
          <template v-if="props.layout === 'bar'">
            <UBadge
              v-for="(badge, index) in badges"
              :key="index"
              :label="processText(badge.label)"
              :icon="badge.icon"
              :color="badge.tone ?? 'neutral'"
              variant="soft"
              size="sm"
              class="shrink-0"
            />
          </template>
        </span>
        <template v-if="props.layout === 'block' && !isShort">
          <span
            v-if="content.time && timeText"
            class="truncate tabular-nums opacity-80"
          >
            {{ timeText }}
          </span>
          <span
            v-if="content.subtitle && event.subtitle"
            class="truncate opacity-80"
          >
            {{ event.subtitle }}
          </span>
          <template v-if="showDetails">
            <span
              v-if="content.location && event.location"
              class="flex min-w-0 items-center gap-0.5 opacity-80"
            >
              <UIcon name="i-ph-map-pin" class="size-3 shrink-0" />
              <span class="truncate">{{ event.location }}</span>
            </span>
            <span v-if="resourceNames" class="truncate opacity-80">
              {{ resourceNames }}
            </span>
            <span
              v-if="content.description && description"
              class="line-clamp-2 opacity-70"
            >
              {{ description }}
            </span>
            <span v-if="badges.length" class="flex flex-wrap gap-0.5">
              <UBadge
                v-for="(badge, index) in badges"
                :key="index"
                :label="processText(badge.label)"
                :icon="badge.icon"
                :color="badge.tone ?? 'neutral'"
                variant="soft"
                size="sm"
              />
            </span>
          </template>
          <UAvatar
            v-if="avatar && showDetails"
            :src="avatar.src"
            :text="avatar.initials"
            size="3xs"
            class="absolute end-1 bottom-1"
          />
        </template>
      </template>
      <template v-if="canResize">
        <span
          v-if="!props.continuesBefore"
          aria-hidden="true"
          class="absolute opacity-0 group-hover/chip:opacity-100"
          :class="
            isVertical
              ? 'inset-x-2 top-0 h-1.5 cursor-ns-resize'
              : 'inset-y-0 start-0 w-1.5 cursor-ew-resize'
          "
          data-agenda-resize="start"
          @pointerdown="onResizeDown($event, 'resizeStart')"
        />
        <span
          v-if="!props.continuesAfter"
          aria-hidden="true"
          class="absolute opacity-0 group-hover/chip:opacity-100"
          :class="
            isVertical
              ? 'inset-x-2 bottom-0 h-1.5 cursor-ns-resize after:absolute after:inset-x-1/3 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-current'
              : 'inset-y-0 end-0 w-1.5 cursor-ew-resize'
          "
          data-agenda-resize="end"
          @pointerdown="onResizeDown($event, 'resizeEnd')"
        />
      </template>
    </button>
    <template #content>
      <div class="flex max-w-72 flex-col gap-1 py-0.5 text-xs">
        <span class="text-highlighted font-semibold">{{ event.title }}</span>
        <span class="text-muted">
          {{ whenText }}
        </span>
        <span v-if="calendarLabel" class="text-muted">{{ calendarLabel }}</span>
        <span v-if="event.location" class="flex items-center gap-1">
          <UIcon name="i-ph-map-pin" class="size-3" />
          {{ event.location }}
        </span>
        <span v-if="description" class="line-clamp-4">{{ description }}</span>
        <span
          v-for="(issue, index) in issues"
          :key="index"
          :class="issue.tone === 'error' ? 'text-error' : 'text-warning'"
        >
          {{ processText(issue.message) }}
        </span>
        <span v-if="props.occurrence.stateMessage" class="text-error">
          {{ props.occurrence.stateMessage }}
        </span>
      </div>
    </template>
  </UTooltip>
</template>
