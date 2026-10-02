<script setup lang="ts">
import { computed, resolveComponent, useSlots } from "vue";
import { tv } from "tailwind-variants";
import DmsIconWell, {
  type IconWellSize,
  type IconWellTone,
} from "../icon-well/IconWell.vue";

export type ListRowSize = "sm" | "md";
export type ListRowMarker = "leading" | "trailing";

interface ListRowProps {
  /** Root element when the row is not a link (`div`, `li`, `article`…). */
  as?: string;
  /** Turns the whole row into a link (rendered through `DmsLink`). */
  to?: string;
  /** Leading icon well; the `leading` slot replaces it (avatar, initials). */
  icon?: string;
  /** Well tone. `muted` (default) is the quiet v2 .cs-rowicon. */
  tone?: IconWellTone;
  /** Well size; defaults to `md` (34px, v2 settings row). */
  iconSize?: IconWellSize;
  /** Title text (the default slot overrides it, for inline badges). */
  title?: string;
  /** Muted line under the title (notification body). */
  description?: string;
  /** Meta entries, joined by "·" (the `meta` slot overrides them). */
  meta?: string[];
  /** Mono meta (times, paths, ids); the title stays sans. */
  mono?: boolean;
  /**
   * `md` v2 settings row (14px title, centred, 20px column gap), `sm` feed /
   * inbox row (13px title, top-aligned).
   */
  size?: ListRowSize;
  /**
   * Read state. Left out, the row has none; `true` shows the accent dot and
   * a bold title, `false` a quieter title (inbox).
   */
  unread?: boolean;
  /**
   * Where the unread dot sits: `trailing` after the trailing meta (feed) or
   * `leading`, a reserved column before the icon (inbox, keeps rows aligned).
   */
  marker?: ListRowMarker;
  /** Screen-reader text of the unread dot. */
  unreadLabel?: string;
  /** The current entry ("This device"): accent rail and a fading tint. */
  current?: boolean;
  /** Hover band (clickable rows). Implied by `to`. */
  interactive?: boolean;
  /** Single-line title and meta, cut with an ellipsis (they wrap on phones). */
  truncate?: boolean;
  /** Mono text after the title column (a time, a count). */
  trailing?: string;
  /**
   * Only the lead (icon, title, meta): no padding, hairline or trailing
   * column. For a lead placed inside another row, e.g. a settings row label.
   */
  bare?: boolean;
}

interface ListRowSlots {
  /** Title content (badges inline after the text). */
  default?: () => unknown;
  /** Replaces the icon well. */
  leading?: () => unknown;
  description?: () => unknown;
  /** Meta entries: direct `<span>` children are joined by "·". */
  meta?: () => unknown;
  /** Right column: actions, a status, a time. */
  trailing?: () => unknown;
}

const props = withDefaults(defineProps<ListRowProps>(), {
  as: "div",
  to: undefined,
  icon: undefined,
  tone: "muted",
  iconSize: "md",
  title: undefined,
  description: undefined,
  meta: undefined,
  mono: false,
  size: "md",
  // Undefined, not false: an absent read state is not "read".
  unread: undefined,
  marker: "trailing",
  unreadLabel: undefined,
  current: false,
  interactive: false,
  truncate: false,
  trailing: undefined,
  bare: false,
});
defineSlots<ListRowSlots>();
const slots = useSlots();
const { t } = useI18n();

// The marker column is as tall as the well so the dot sits on its centre.
const MARKER_HEIGHTS: Record<IconWellSize, string> = {
  "2xs": "h-7",
  xs: "h-[30px]",
  sm: "h-8",
  md: "h-[34px]",
  lg: "h-9",
  xl: "h-10",
  "2xl": "h-11",
};

// v2 .cs-lead / .activity / .cs-notif: one row of a list inside a card. Rows
// are set apart by a hairline only between two rows, so a day separator or a
// card head above the first one keeps its own edge.
const theme = tv({
  slots: {
    root: "dms-list-row border-muted grid min-w-0 [.dms-list-row+&]:border-t",
    lead: "flex min-w-0 gap-3",
    marker: "grid w-2.5 shrink-0 place-items-start content-center",
    dot: "size-2 rounded-full bg-(--dms-accent-fill) shadow-[0_0_0_3px_var(--dms-accent-tint)]",
    body: "min-w-0 flex-1",
    title: "flex items-center gap-2",
    description: "text-muted mt-0.5 text-[12.5px]",
    // The "·" closes each entry followed by another (rather than opening it),
    // so a wrapped line never starts with a separator.
    meta: "flex flex-wrap items-center gap-x-2 gap-y-1 [&>span:has(+span)]:after:text-dimmed [&>span:has(+span)]:after:ms-2 [&>span:has(+span)]:after:content-['·']",
    trailing: "flex shrink-0 items-center gap-2",
    trailingText:
      "text-dimmed text-right font-mono text-[11.5px] font-medium whitespace-nowrap",
    trailingDot:
      "size-[7px] shrink-0 rounded-full bg-(--dms-accent-fill) ring-3 ring-(--dms-accent-tint)",
  },
  variants: {
    size: {
      // A wrapping flex row rather than a grid: the trailing column (a
      // chevron, a time, a button) stays beside the lead while the lead keeps
      // at least 11rem, and only then drops under it, end-aligned (a phone,
      // wide actions).
      md: {
        root: "flex flex-wrap items-center gap-x-5 gap-y-2 px-[18px] py-3.5",
        lead: "flex-[1_1_11rem] items-center",
        trailing: "ms-auto",
        title: "text-highlighted flex-wrap text-sm font-semibold",
        meta: "text-muted mt-[3px] text-[12.5px] font-normal",
      },
      sm: {
        root: "grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 px-[18px] py-2.5",
        lead: "items-start",
        title: "text-[13px] leading-[1.4]",
        description: "leading-[1.45]",
        meta: "text-dimmed mt-px text-xs",
      },
    },
    readState: {
      none: {},
      unread: {},
      read: {},
    },
    mono: {
      true: { meta: "text-dimmed font-mono text-[11px] font-medium" },
    },
    hasDescription: {
      true: { meta: "mt-1.5" },
    },
    hasTrailing: {
      false: { root: "grid-cols-1" },
    },
    leadingMarker: {
      true: { root: "py-3.5 ps-3.5 pe-4" },
    },
    interactive: {
      true: {
        root: "transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--ui-bg-elevated)_60%,transparent)]",
      },
    },
    current: {
      true: {
        root: "bg-linear-90 from-(--dms-accent-tint) to-transparent to-60% shadow-[inset_2px_0_0_var(--dms-accent)]",
      },
    },
    // One line on wide screens; a phone has no hover to reveal the cut
    // end, so the title and meta wrap there instead.
    truncate: {
      true: {
        title: "truncate max-sm:whitespace-normal",
        meta: "flex-nowrap overflow-hidden whitespace-nowrap max-sm:flex-wrap max-sm:whitespace-normal",
      },
    },
    bare: {
      true: { root: "flex flex-nowrap items-center gap-3 border-0 p-0" },
    },
  },
  compoundVariants: [
    {
      size: "sm",
      readState: "none",
      class: { title: "text-highlighted font-medium" },
    },
    {
      size: "sm",
      readState: "unread",
      class: { title: "text-highlighted font-semibold" },
    },
    { size: "sm", readState: "read", class: { title: "text-toned" } },
  ],
});

const readState = computed(() => {
  if (props.unread === undefined) return "none";
  return props.unread ? "unread" : "read";
});
const hasLeadingMarker = computed(
  () => props.marker === "leading" && props.unread !== undefined,
);
const hasTrailingDot = computed(
  () => props.marker === "trailing" && props.unread === true,
);
const hasTrailing = computed(
  () => !!slots.trailing || !!props.trailing || hasTrailingDot.value,
);
const hasDescription = computed(
  () => !!props.description || !!slots.description,
);
const hasMeta = computed(() => !!slots.meta || !!props.meta?.length);

const ui = computed(() =>
  theme({
    size: props.size,
    readState: readState.value,
    mono: props.mono,
    hasDescription: hasDescription.value,
    hasTrailing: hasTrailing.value,
    leadingMarker: hasLeadingMarker.value,
    interactive: props.interactive || !!props.to,
    current: props.current,
    truncate: props.truncate,
    bare: props.bare,
  }),
);

const rootTag = computed(() =>
  props.to && !props.bare ? resolveComponent("DmsLink") : props.as,
);
const unreadText = computed(
  () => props.unreadLabel ?? t("dms.list_row.unread"),
);
</script>

<template>
  <component
    :is="rootTag"
    :to="props.to && !props.bare ? props.to : undefined"
    :class="ui.root()"
  >
    <div :class="props.bare ? 'contents' : ui.lead()">
      <span
        v-if="hasLeadingMarker"
        :class="[ui.marker(), MARKER_HEIGHTS[props.iconSize]]"
      >
        <span :class="[ui.dot(), { invisible: !props.unread }]" />
        <span v-if="props.unread" class="sr-only">{{ unreadText }}</span>
      </span>
      <slot name="leading">
        <DmsIconWell
          v-if="props.icon"
          :icon="props.icon"
          :tone="props.tone"
          :size="props.iconSize"
        />
      </slot>
      <div :class="ui.body()">
        <div
          v-if="props.title || slots.default"
          :class="ui.title()"
          :title="props.truncate ? props.title : undefined"
        >
          <slot>{{ props.title }}</slot>
        </div>
        <p v-if="hasDescription" :class="ui.description()">
          <slot name="description">{{ props.description }}</slot>
        </p>
        <div v-if="hasMeta" :class="ui.meta()">
          <slot name="meta">
            <span v-for="(entry, index) in props.meta" :key="index">
              {{ entry }}
            </span>
          </slot>
        </div>
      </div>
    </div>
    <div v-if="hasTrailing && !props.bare" :class="ui.trailing()">
      <slot name="trailing">
        <span v-if="props.trailing" :class="ui.trailingText()">
          {{ props.trailing }}
        </span>
      </slot>
      <span v-if="hasTrailingDot" :class="ui.trailingDot()">
        <span class="sr-only">{{ unreadText }}</span>
      </span>
    </div>
  </component>
</template>
