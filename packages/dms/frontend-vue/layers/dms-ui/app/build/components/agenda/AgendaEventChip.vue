<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import AgendaChipTooltip from "./AgendaChipTooltip.vue";
import AgendaPinnedMarks from "./AgendaPinnedMarks.vue";
import type { AgendaOccurrence } from "../../composables/agenda/agendaModel";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import {
  ALERT_MARK_TONES,
  CHIP_COMPACT_CLASSES as COMPACT_CLASSES,
  CHIP_LAYOUT_CLASSES as LAYOUT_CLASSES,
  CHIP_ROUNDED as ROUNDED,
  MARK_DISC_CLASSES,
  TWO_LINE_BAR_CLASSES,
  MARK_DOT_CLASSES,
  STATE_ICONS,
  alertMarkOf,
  blockLinesThatFit,
  chipLabelExtras,
  chipClasses,
  chipPaintVars,
  issueTone,
  pinnedBadgesOf,
  plainText,
  resolveEventContent,
  type AgendaChipLayout,
  type BlockLine,
} from "../../composables/agenda/agendaChip";
import { describeWhen } from "../../composables/agenda/agendaDescribe";
import { useComposedText } from "../../../../../dms-core/app/composables/translation/useComposedText";

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
  /**
   * Pixels of the chip's height: a short block keeps its title and time on
   * one line; a bar of 40 px or more shows its subtitle under its title.
   */
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

/** From this height a block draws its avatar. */
const AVATAR_FROM = 52;
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
/**
 * The alerts of the event's subject, as one icon in the tone of the
 * strongest on every chip, short ones included: a 15-minute event shows it
 * as a long one does, which also keeps its badges.
 */
const alertMark = computed(() =>
  content.value.badges ? alertMarkOf(event.value.badges) : null,
);
const alertName = computed(() =>
  alertMark.value
    ? t("dms.agenda.grid.alerts", {
        labels: alertMark.value.labels.map(processText).join(", "),
      })
    : "",
);
/**
 * The states of the event that must be seen on every chip (an overbooked
 * slot), as one icon each in their tone: a 30-minute event shows them as a
 * long one does.
 */
const pinned = computed(() =>
  content.value.badges ? pinnedBadgesOf(event.value.badges) : [],
);
/**
 * The event's step in a workflow: an icon on a disc
 * of its tone on every layout, named in the chip's name and its tooltip.
 */
const mark = computed(() => {
  const given = event.value.mark;
  return given
    ? {
        icon: given.icon,
        tone: given.tone ?? "neutral",
        label: processText(given.label),
      }
    : null;
});
const ariaLabel = computed(() =>
  [
    ctx.describe(props.occurrence),
    ...chipLabelExtras(props.occurrence, t, processText),
    ...(alertName.value ? [alertName.value] : []),
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
const tone = computed(() => issueTone(event.value.issues));
const badges = computed(() => {
  const list = content.value.badges ? (event.value.badges ?? []) : [];
  if (props.layout !== "block") return list.slice(0, BAR_BADGES);
  const given = event.value.mark;
  return given
    ? [{ label: given.label, icon: given.icon, tone: given.tone }, ...list]
    : list;
});
const avatar = computed(() =>
  content.value.avatar ? event.value.avatar : undefined,
);
const hasTooltip = computed(() => raw.value.tooltips !== false);
const TOOLTIP_UI = { content: "[[data-agenda-dragging]_&]:hidden" };
const isCompact = computed(() => raw.value.density === "compact");
const wantedLines = computed<BlockLine[]>(() => {
  const lines: BlockLine[] = [];
  if (content.value.time && timeText.value) lines.push("time");
  if (content.value.subtitle && event.value.subtitle) lines.push("subtitle");
  if (content.value.location && event.value.location) lines.push("location");
  if (resourceNames.value) lines.push("resource");
  if (content.value.description && description.value) lines.push("description");
  if (badges.value.length) lines.push("badges");
  return lines;
});
/** The lines under the title that fit whole in the block's height. */
const shownLines = computed(
  () =>
    new Set(
      props.layout === "block"
        ? blockLinesThatFit(
            props.height ?? Number.POSITIVE_INFINITY,
            isCompact.value ? "compact" : "normal",
            wantedLines.value,
          )
        : [],
    ),
);
const showAvatar = computed(
  () =>
    props.layout === "block" &&
    (props.height ?? Number.POSITIVE_INFINITY) >= AVATAR_FROM,
);
const canResize = computed(
  () =>
    ctx.options.value.dragResize &&
    props.occurrence.canResize &&
    props.layout !== "dot" &&
    props.layout !== "cell",
);
const isVertical = computed(() => props.layout === "block");
/** Pixels from which a bar has room for its subtitle under its title. */
const TWO_LINE_BAR_FROM = 40;
/** A tall bar (a timeline's two-line lane): the subtitle on its own line. */
const isTwoLineBar = computed(
  () =>
    props.layout === "bar" &&
    (props.height ?? 0) >= TWO_LINE_BAR_FROM &&
    content.value.subtitle &&
    Boolean(event.value.subtitle),
);
/** On a timeline by slot the slot is the time: a bar shows none. */
const isSlotTimeline = computed(
  () => ctx.view.value.type === "timeline" && ctx.view.value.scale === "slot",
);
/** The start time after the title: on a bar (not cut before), or a short block. */
const inlineTime = computed(() => {
  if (!content.value.time || !startText.value) return false;
  if (props.layout === "bar") {
    return !props.continuesBefore && !isSlotTimeline.value;
  }
  return !shownLines.value.has("time");
});

const hasEdgeBar = computed(
  () =>
    (props.layout === "block" || props.layout === "bar") &&
    ["soft", "dashed", undefined].includes(event.value.style),
);

const rootClasses = computed(() => [
  "group/chip relative flex size-full min-w-0 cursor-pointer overflow-hidden text-start select-none",
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--ui-primary)",
  ROUNDED[props.layout],
  isTwoLineBar.value
    ? TWO_LINE_BAR_CLASSES
    : (isCompact.value ? COMPACT_CLASSES : LAYOUT_CLASSES)[props.layout],
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

/**
 * A keyboard move or a drop moved this event (its chip may be a new one, in
 * another day): the focus comes back to it once it is drawn there.
 */
function takeFocusBack(): void {
  const el = chipEl.value;
  if (!el || ctx.drag.refocusKey.value !== props.occurrence.key) return;
  const active = document.activeElement;
  if (active === el) return;
  ctx.drag.refocusKey.value = null;
  const isLost =
    !active ||
    active === document.body ||
    Boolean(active.closest("[data-agenda-occurrence]"));
  if (!isLost) return;
  el.focus();
  ctx.focusedKey.value = props.occurrence.key;
}
onMounted(takeFocusBack);
watch(() => ctx.drag.refocusKey.value, takeFocusBack, { flush: "post" });

function onFocusOut(): void {
  if (isFocusedKey.value) ctx.focusedKey.value = null;
}

function onPointerDown(pointer: PointerEvent): void {
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
        <span
          v-if="mark"
          aria-hidden="true"
          data-agenda-status-mark
          class="absolute end-0.5 top-0.5 size-1.5 rounded-full"
          :class="MARK_DOT_CLASSES[mark.tone]"
        />
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
        <span
          v-if="mark"
          aria-hidden="true"
          data-agenda-status-mark
          class="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full"
          :class="MARK_DISC_CLASSES[mark.tone]"
        >
          <UIcon :name="mark.icon" class="size-2.5" />
        </span>
        <span class="max-w-full shrink-0 truncate font-medium">
          {{ event.title }}
        </span>
        <UIcon
          v-if="alertMark"
          :name="alertMark.icon"
          role="img"
          :aria-label="alertName"
          data-agenda-alert-mark
          class="size-3 shrink-0"
          :class="ALERT_MARK_TONES[alertMark.tone]"
        />
        <AgendaPinnedMarks :badges="pinned" icon-class="size-3" />
      </template>
      <template v-else>
        <span class="flex min-w-0 items-center gap-1">
          <span
            v-if="mark"
            aria-hidden="true"
            data-agenda-status-mark
            class="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full"
            :class="MARK_DISC_CLASSES[mark.tone]"
          >
            <UIcon :name="mark.icon" class="size-2.5" />
          </span>
          <UIcon
            v-if="content.icon && event.icon"
            :name="event.icon"
            class="size-3.5 shrink-0"
          />
          <!--
            The title first and never cut for the rest: the time and the
            badges after it wrap onto a hidden second line when they do not
            fit whole.
          -->
          <span
            class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 overflow-hidden"
            :class="props.layout === 'bar' ? 'h-5' : 'h-[1.25em]'"
          >
            <span class="max-w-full truncate font-medium">
              {{ event.title }}
            </span>
            <span
              v-if="inlineTime"
              class="whitespace-nowrap tabular-nums opacity-80"
            >
              {{ startText }}
            </span>
            <template v-if="props.layout === 'bar'">
              <UBadge
                v-for="(badge, index) in badges"
                :key="index"
                :label="processText(badge.label)"
                :icon="badge.icon"
                :color="badge.tone ?? 'neutral'"
                variant="soft"
                size="sm"
              />
            </template>
          </span>
          <UIcon
            v-if="alertMark"
            :name="alertMark.icon"
            role="img"
            :aria-label="alertName"
            data-agenda-alert-mark
            class="size-3.5 shrink-0"
            :class="ALERT_MARK_TONES[alertMark.tone]"
          />
          <AgendaPinnedMarks :badges="pinned" icon-class="size-3.5" />
          <UIcon
            v-if="props.occurrence.state"
            :name="STATE_ICONS[props.occurrence.state]"
            class="size-3.5 shrink-0"
            :class="props.occurrence.state === 'saving' && 'animate-spin'"
          />
          <UIcon
            v-if="tone"
            name="i-ph-warning"
            class="size-3.5 shrink-0"
            :class="tone === 'error' ? 'text-error' : 'text-warning'"
          />
        </span>
        <span v-if="isTwoLineBar" class="truncate opacity-80">
          {{ event.subtitle }}
        </span>
        <template v-if="props.layout === 'block'">
          <span
            v-if="shownLines.has('time')"
            class="shrink-0 truncate tabular-nums opacity-80"
          >
            {{ timeText }}
          </span>
          <span
            v-if="shownLines.has('subtitle')"
            class="shrink-0 truncate opacity-80"
          >
            {{ event.subtitle }}
          </span>
          <span
            v-if="shownLines.has('location')"
            class="flex min-w-0 shrink-0 items-center gap-0.5 opacity-80"
          >
            <UIcon name="i-ph-map-pin" class="size-3 shrink-0" />
            <span class="truncate">{{ event.location }}</span>
          </span>
          <span
            v-if="shownLines.has('resource')"
            class="shrink-0 truncate opacity-80"
          >
            {{ resourceNames }}
          </span>
          <span
            v-if="shownLines.has('description')"
            class="line-clamp-2 opacity-70"
          >
            {{ description }}
          </span>
          <span
            v-if="shownLines.has('badges')"
            class="flex max-h-5 min-h-0 flex-wrap gap-0.5 overflow-hidden"
          >
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
          <UAvatar
            v-if="avatar && showAvatar"
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
      <AgendaChipTooltip
        :occurrence="props.occurrence"
        :mark="mark"
        :pinned="pinned.map((badge) => processText(badge.label))"
        :when="whenText"
        :calendar="calendarLabel"
        :description="description"
      />
    </template>
  </UTooltip>
</template>
