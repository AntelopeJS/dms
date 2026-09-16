<script setup lang="ts">
import { computed } from "vue";
import type { TopListItem } from "../../../composables/chart/types";

interface Props {
  item: TopListItem;
  showRank: boolean;
  rankLabel: string;
  rankClass: string;
  hasAnyIcon: boolean;
  showSparkline: boolean;
  sparklineAccent: string;
  showDelta: boolean;
  invert?: boolean;
  formattedValue: string;
}

const props = defineProps<Props>();

const { processI18n } = useTranslation();

const titleDisplay = computed(() => processI18n(props.item.title));
const descriptionDisplay = computed(() =>
  props.item.description ? processI18n(props.item.description) : "",
);

const hasSparklineData = computed(
  () => (props.item.sparkline?.length ?? 0) > 0,
);
const hasDeltaData = computed(
  () => props.item.delta !== null && props.item.delta !== undefined,
);
const deltaForBadge = computed(() =>
  hasDeltaData.value ? (props.item.delta as number) : null,
);
</script>

<template>
  <li
    class="hover:bg-elevated/60 relative col-[1/-1] grid grid-cols-subgrid items-center py-2.5 transition-colors"
    :class="item.to ? 'cursor-pointer' : ''"
  >
    <DmsLink
      v-if="item.to"
      :to="item.to"
      class="absolute inset-0 z-10"
      :aria-label="titleDisplay"
    />
    <span
      v-if="showRank"
      class="text-center font-mono text-xs tabular-nums"
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
      <UIcon
        v-else-if="item.icon"
        :name="item.icon"
        class="text-toned size-5"
      />
      <span v-else aria-hidden="true" />
    </template>
    <div class="min-w-0">
      <p class="truncate text-sm font-medium">{{ titleDisplay }}</p>
      <p v-if="item.description" class="text-muted truncate text-xs">
        {{ descriptionDisplay }}
      </p>
    </div>
    <span
      class="text-muted justify-self-end text-xs whitespace-nowrap tabular-nums"
    >
      {{ formattedValue }}
    </span>
    <div v-if="showSparkline" class="h-6 w-16">
      <DmsSparkline
        v-if="hasSparklineData"
        :values="item.sparkline ?? []"
        :accent="sparklineAccent"
        :aria-label="titleDisplay"
      />
    </div>
    <DmsTrendBadge
      v-if="showDelta"
      :delta="deltaForBadge"
      :invert="invert"
      class="justify-self-end"
    />
  </li>
</template>
