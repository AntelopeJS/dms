<script setup lang="ts">
import { computed } from "vue";
import type { TopListItem } from "../../../composables/chart/types";

interface Props {
  item: TopListItem;
  showRank: boolean;
  rankLabel: string;
  /** Classes of the 26px rank tile (solid fill for the top N, ring otherwise). */
  rankClass: string;
  hasAnyIcon: boolean;
  showSparkline: boolean;
  sparklineAccent: string;
  showDelta: boolean;
  invert?: boolean;
  formattedValue: string;
  /** Width of the proportion bar in %, or null to hide it. */
  barPercent?: number | null;
  barClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  barPercent: null,
  barClass: "",
});

const PERCENT_UNIT = "%";

const { processI18n } = useTranslation();

const titleDisplay = computed(() => processI18n(props.item.title));
const descriptionDisplay = computed(() =>
  props.item.description ? processI18n(props.item.description) : "",
);

const hasSparklineData = computed(
  () => (props.item.sparkline?.length ?? 0) > 0,
);
const deltaForBadge = computed(() => props.item.delta ?? null);
const barStyle = computed(() => ({
  width: `${props.barPercent ?? 0}${PERCENT_UNIT}`,
}));
</script>

<template>
  <li
    class="relative col-[1/-1] grid grid-cols-subgrid items-center transition-colors hover:bg-(--ui-bg-elevated)/60"
    :class="[
      item.to ? 'cursor-pointer' : '',
      barPercent === null ? 'h-14' : 'h-[60px]',
    ]"
  >
    <DmsLink
      v-if="item.to"
      :to="item.to"
      class="absolute inset-0 z-10"
      :aria-label="titleDisplay"
    />
    <span aria-hidden="true" />
    <span
      v-if="showRank"
      class="grid size-[26px] place-items-center rounded-[7px] font-mono text-[11px] font-bold tabular-nums"
      :class="rankClass"
    >
      {{ rankLabel }}
    </span>
    <template v-if="hasAnyIcon">
      <UAvatar
        v-if="item.avatar"
        :src="item.avatar.src"
        :alt="item.avatar.alt"
        size="sm"
      />
      <span
        v-else-if="item.icon"
        class="text-muted grid size-[26px] place-items-center rounded-[7px] bg-(--ui-bg-elevated)"
      >
        <UIcon :name="item.icon" class="size-[15px]" :aria-hidden="true" />
      </span>
      <span v-else aria-hidden="true" />
    </template>
    <div class="min-w-0">
      <p
        class="text-highlighted truncate text-[13px] leading-[1.35] font-[550]"
      >
        {{ titleDisplay }}
      </p>
      <p v-if="item.description" class="text-dimmed truncate text-xs">
        {{ descriptionDisplay }}
      </p>
      <div
        v-if="barPercent !== null"
        class="mt-1.5 h-[3px] overflow-hidden rounded-full bg-(--ui-bg-elevated)"
      >
        <div class="h-full rounded-full" :class="barClass" :style="barStyle" />
      </div>
    </div>
    <span
      class="text-toned justify-self-end font-mono text-[13px] whitespace-nowrap tabular-nums"
    >
      {{ formattedValue }}
    </span>
    <div v-if="showSparkline" class="h-6 w-16">
      <DmsSparkline
        v-if="hasSparklineData"
        :values="item.sparkline ?? []"
        :accent="sparklineAccent"
        :aria-label="titleDisplay"
        area="flat"
      />
    </div>
    <DmsTrendBadge
      v-if="showDelta"
      :delta="deltaForBadge"
      :invert="invert"
      variant="text"
      class="justify-self-end"
    />
    <span aria-hidden="true" />
  </li>
</template>
