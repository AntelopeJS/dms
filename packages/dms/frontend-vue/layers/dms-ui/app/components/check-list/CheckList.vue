<script setup lang="ts">
import { computed } from "vue";
import { tv } from "tailwind-variants";

export type CheckListState = "ok" | "warn" | "error" | "pending" | "info";
export type CheckListMarker = "icon" | "plain" | "glyph";
export type CheckListSize = "xs" | "sm" | "md";

export interface CheckListItem {
  /** Stable key; defaults to the label. */
  id?: string;
  label: string;
  state: CheckListState;
  /** Spans every column of a multi-column list (a long last rule). */
  wide?: boolean;
}

interface CheckListProps {
  items: CheckListItem[];
  /**
   * Nothing evaluated yet (empty field): `error` items read as `pending`, so
   * a rule list does not start out red.
   */
  pristine?: boolean;
  /**
   * `icon` circled icons (sign-up rules), `plain` bare check / cross icons
   * (settings password), `glyph` mono characters ✓ ! × → (module readout).
   */
  marker?: CheckListMarker;
  /** `md` 12.5px, `sm` 12px, `xs` 11.5px mono readout lines. */
  size?: CheckListSize;
  /** Columns from `sm` up (one column on phones). */
  columns?: 1 | 2 | 3;
  /** Muted box around the list (v2 .ob-rules / .pw). */
  framed?: boolean;
  /** Labels take their state color (ok brighter, error red); off = all muted. */
  tintLabels?: boolean;
  /** Each line on one row, cut with an ellipsis. */
  truncate?: boolean;
  /** Announce changes (`aria-live="polite"`), for lists that react to typing. */
  live?: boolean;
}

interface CheckListSlots {
  /** Inside the frame, above the list (summary, strength bars…). */
  header?: () => unknown;
  /** Custom label content. */
  label?: (props: { item: CheckListItem; state: CheckListState }) => unknown;
}

const props = withDefaults(defineProps<CheckListProps>(), {
  pristine: false,
  marker: "icon",
  size: "md",
  columns: 1,
  framed: false,
  tintLabels: true,
  truncate: false,
  live: false,
});
defineSlots<CheckListSlots>();

const ICONS: Record<
  Exclude<CheckListMarker, "glyph">,
  Record<CheckListState, string>
> = {
  icon: {
    ok: "i-ph-check-circle",
    warn: "i-ph-warning-circle",
    error: "i-ph-x-circle",
    pending: "i-ph-circle",
    info: "i-ph-arrow-circle-right",
  },
  plain: {
    ok: "i-ph-check",
    warn: "i-ph-warning",
    error: "i-ph-x",
    pending: "i-ph-x",
    info: "i-ph-arrow-right",
  },
};

const GLYPHS: Record<CheckListState, string> = {
  ok: "✓",
  warn: "!",
  error: "×",
  pending: "·",
  info: "→",
};

const MARKER_CLASSES: Record<CheckListState, string> = {
  ok: "text-success",
  warn: "text-warning",
  error: "text-error",
  pending: "text-dimmed",
  info: "text-primary",
};

const LABEL_CLASSES: Record<CheckListState, string> = {
  ok: "text-toned",
  warn: "text-warning",
  error: "text-error",
  pending: "",
  info: "",
};

const STATE_KEYS: Record<CheckListState, string> = {
  ok: "dms.check_list.state.ok",
  warn: "dms.check_list.state.warn",
  error: "dms.check_list.state.error",
  pending: "dms.check_list.state.pending",
  info: "dms.check_list.state.info",
};

const theme = tv({
  slots: {
    root: "",
    list: "text-muted grid",
    item: "flex min-w-0 items-center",
    marker: "shrink-0",
    label: "min-w-0",
  },
  variants: {
    size: {
      md: {
        list: "gap-[5px] text-[12.5px]",
        item: "gap-2",
        marker: "size-3.5",
      },
      sm: {
        list: "gap-x-3 gap-y-1 text-xs",
        item: "gap-1.5",
        marker: "size-[13px]",
      },
      xs: {
        list: "gap-0.5 font-mono text-[11.5px] leading-[1.55]",
        item: "gap-1.5",
        marker: "",
      },
    },
    columns: {
      1: {},
      2: { list: "sm:grid-cols-2" },
      3: { list: "sm:grid-cols-3" },
    },
    framed: {
      true: {
        root: "border-default grid gap-2 rounded-md border bg-(--dms-bg-muted) px-3 py-2.5",
      },
    },
    truncate: {
      true: { item: "whitespace-nowrap", label: "truncate" },
    },
  },
  compoundVariants: [
    {
      framed: true,
      size: "sm",
      class: { list: "mt-0.5" },
    },
  ],
});

const ui = computed(() =>
  theme({
    size: props.size,
    columns: props.columns,
    framed: props.framed,
    truncate: props.truncate,
  }),
);

function stateOf(item: CheckListItem): CheckListState {
  return props.pristine && item.state === "error" ? "pending" : item.state;
}

const rows = computed(() =>
  props.items.map((item) => {
    const state = stateOf(item);
    return {
      item,
      state,
      key: item.id ?? item.label,
      icon: props.marker === "glyph" ? undefined : ICONS[props.marker][state],
      glyph: props.marker === "glyph" ? GLYPHS[state] : undefined,
    };
  }),
);
</script>

<template>
  <div :class="ui.root()">
    <slot name="header" />
    <ul :class="ui.list()" :aria-live="props.live ? 'polite' : undefined">
      <li
        v-for="row in rows"
        :key="row.key"
        :class="[
          ui.item(),
          props.tintLabels && LABEL_CLASSES[row.state],
          row.item.wide && 'col-span-full',
        ]"
      >
        <UIcon
          v-if="row.icon"
          :name="row.icon"
          :class="[ui.marker(), MARKER_CLASSES[row.state]]"
          :aria-hidden="true"
        />
        <span
          v-else
          :class="[ui.marker(), MARKER_CLASSES[row.state]]"
          aria-hidden="true"
        >
          {{ row.glyph }}
        </span>
        <span :class="ui.label()">
          <slot name="label" :item="row.item" :state="row.state">
            {{ row.item.label }}
          </slot>
        </span>
        <span v-if="props.live" class="sr-only">
          {{ $t(STATE_KEYS[row.state]) }}
        </span>
      </li>
    </ul>
  </div>
</template>
