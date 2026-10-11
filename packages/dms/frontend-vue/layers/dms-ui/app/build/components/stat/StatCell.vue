<script setup lang="ts">
import { computed } from "vue";
import DmsIconWell, {
  type IconWellTone,
} from "../../../components/icon-well/IconWell.vue";
import DmsEyebrow from "../../../components/section-header/Eyebrow.vue";
import DmsAutoLink from "../../../components/link/AutoLink.vue";
import { DMS_TONE_TEXT } from "../../utils/tone";
import type { Tone } from "../../../types/tone";

// One headline figure: icon well, mono label, value, detail line. The one
// markup behind the compact KPI card (`KpiCard variant="stat"`) and every cell
// of a StatGroup, so the two never drift apart.
//
// - size `md`: the compact stat card (v2 .mc-summary), framed, 40px well,
//   22px value; `#aside` holds what sits on its right (a KPI's trend).
// - size `sm`: a bare cell of a joined group (v2 .cs-status), 32px well,
//   14px value; the group draws the frame and the hairlines.
export type StatCellSize = "md" | "sm";

interface StatCellProps {
  /** Mono label above the value; drawn as a skeleton in `placeholder`. */
  eyebrow?: string;
  /** The figure or the short state; the `#value` slot replaces it. */
  value?: string | number;
  /** Icon of the well; the cell has no well without one. */
  icon?: string;
  tone?: IconWellTone;
  /** One line under the value. */
  detail?: string;
  /** Tone of the detail line (`neutral` = muted text). */
  detailTone?: Tone;
  /** Route, `#anchor` or URL the whole cell links to. */
  to?: string;
  size?: StatCellSize;
  /** The value is loading: well and value turn to skeletons, labels stay. */
  loading?: boolean;
  /** Nothing is known yet: every line is a skeleton at its loaded box. */
  placeholder?: boolean;
  /** A refetch runs: the value stays, faded. */
  refreshing?: boolean;
  /**
   * `md` only. Under 28rem of the enclosing `@container` (two cards side by
   * side on a phone) the well goes on top and the lines wrap. Without it, the
   * label wraps on phones only.
   */
  stack?: boolean;
}

interface StatCellSlots {
  /** Replaces the value (a figure split from its unit). */
  value?: () => unknown;
  /** `md` only: the right-hand column (trend, sparkline). */
  aside?: () => unknown;
}

const props = withDefaults(defineProps<StatCellProps>(), {
  eyebrow: "",
  value: undefined,
  icon: undefined,
  tone: "primary",
  detail: undefined,
  detailTone: "neutral",
  to: undefined,
  size: "md",
  loading: false,
  placeholder: false,
  refreshing: false,
  stack: false,
});

defineSlots<StatCellSlots>();

// Literal class strings (Tailwind extracts them).
const MD_CELL = "dms-card flex items-center gap-3.5 px-4 py-3.5";
const MD_STACK = "@max-md:flex-col @max-md:items-start @max-md:gap-2.5";
const SM_CELL = "flex min-w-0 items-start gap-3 px-4 py-3.5";

const isMd = computed(() => props.size === "md");
const wraps = computed(() =>
  props.stack ? "@max-md:whitespace-normal" : "max-sm:whitespace-normal",
);
const cellClass = computed(() => {
  if (!isMd.value) {
    return [SM_CELL, props.to && "hover:bg-elevated transition-colors"];
  }
  return [
    MD_CELL,
    props.stack && MD_STACK,
    props.to && "dms-card--interactive",
  ];
});
const detailClass = computed(() => DMS_TONE_TEXT[props.detailTone]);

const { t } = useI18n();
</script>

<template>
  <component
    :is="props.to ? DmsAutoLink : 'div'"
    :to="props.to"
    :class="cellClass"
  >
    <template v-if="isMd">
      <USkeleton
        :aria-label="t('dms.a11y.loading')"
        v-if="props.placeholder || (props.loading && props.icon)"
        class="size-10 shrink-0 rounded-[10px]"
      />
      <DmsIconWell
        v-else-if="props.icon"
        :icon="props.icon"
        :tone="props.tone"
        size="xl"
      />
      <!-- A placeholder keeps the loaded lines' boxes (eyebrow 13px, value
           24px, detail 16px), so the card keeps its height when it lands. -->
      <div v-if="props.placeholder" class="grid flex-1 gap-[3px]">
        <USkeleton
          :aria-label="t('dms.a11y.loading')"
          class="my-[1.5px] h-2.5 w-20"
        />
        <USkeleton
          :aria-label="t('dms.a11y.loading')"
          class="my-px h-[22px] w-10"
        />
        <USkeleton
          :aria-label="t('dms.a11y.loading')"
          class="my-0.5 h-3 w-24"
        />
      </div>
      <div v-else class="grid min-w-0 flex-1 gap-[3px]">
        <DmsEyebrow
          tone="muted"
          truncate
          :class="wraps"
          :label="props.eyebrow"
        />
        <USkeleton
          :aria-label="t('dms.a11y.loading')"
          v-if="props.loading"
          class="h-[22px] w-16"
        />
        <p
          v-else
          class="text-highlighted text-[22px] leading-[1.1] font-[650] tracking-[-0.035em] tabular-nums transition-opacity"
          :class="props.refreshing && 'opacity-55'"
        >
          <slot name="value">{{ props.value }}</slot>
        </p>
        <p
          v-if="props.detail && !props.loading"
          class="truncate text-xs"
          :class="[wraps, detailClass]"
        >
          {{ props.detail }}
        </p>
      </div>
      <slot name="aside" />
    </template>

    <template v-else>
      <USkeleton
        :aria-label="t('dms.a11y.loading')"
        v-if="props.placeholder || (props.loading && props.icon)"
        class="size-8 shrink-0 rounded-[9px]"
      />
      <DmsIconWell
        v-else-if="props.icon"
        :icon="props.icon"
        :tone="props.tone"
        size="sm"
      />
      <!-- Each placeholder line keeps the loaded line's box (eyebrow 11px,
           value 19px, detail 16px), so the group keeps its height. -->
      <div v-if="props.placeholder" class="grid flex-1 gap-0.5">
        <USkeleton
          :aria-label="t('dms.a11y.loading')"
          class="my-px h-[9px] w-16"
        />
        <USkeleton
          :aria-label="t('dms.a11y.loading')"
          class="my-[2.5px] h-3.5 w-24"
        />
        <USkeleton
          :aria-label="t('dms.a11y.loading')"
          class="my-0.5 h-3 w-20"
        />
      </div>
      <span v-else class="grid min-w-0 gap-0.5">
        <DmsEyebrow as="span" size="xs" :label="props.eyebrow" />
        <USkeleton
          :aria-label="t('dms.a11y.loading')"
          v-if="props.loading"
          class="my-0.5 h-3.5 w-24"
        />
        <b
          v-else
          class="text-highlighted text-sm leading-[1.35] font-semibold whitespace-nowrap tabular-nums transition-opacity"
          :class="props.refreshing && 'opacity-55'"
        >
          <slot name="value">{{ props.value }}</slot>
        </b>
        <template v-if="props.detail">
          <USkeleton
            :aria-label="t('dms.a11y.loading')"
            v-if="props.loading"
            class="h-3 w-20"
          />
          <small v-else class="truncate text-xs" :class="detailClass">
            {{ props.detail }}
          </small>
        </template>
      </span>
    </template>
  </component>
</template>
