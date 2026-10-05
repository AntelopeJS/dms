<script setup lang="ts">
import type { DmsTone } from "#dms-ui/app/utils/tone";
import type {
  CheckListItem,
  CheckListState,
} from "#dms-ui/app/components/check-list/CheckList.vue";
import type {
  ModuleCatalogEntry,
  ModuleReadoutTone,
  ModuleStatus,
} from "../../../../types/page";
import {
  moduleCategory,
  moduleStatus,
} from "../../../../utils/modules-catalog";

interface ModuleCatalogTileProps {
  entry: ModuleCatalogEntry;
  /** Where the tile leads: the last page visited in the module, or its landing page. */
  to: string;
}

const props = defineProps<ModuleCatalogTileProps>();
const { t } = useI18n();
const { processI18n } = useTranslation();

// v2 .module-tile__state: a mono uppercase pill with a leading dot.
const STATUS_TONES: Record<ModuleStatus, DmsTone> = {
  live: "success",
  beta: "secondary",
  update: "warning",
  attention: "error",
};

// v2 .module-tile__viz: each readout line opens with a tone glyph.
const READOUT_STATES: Record<ModuleReadoutTone, CheckListState> = {
  success: "ok",
  info: "info",
  warning: "warn",
  error: "error",
};

const status = computed(() => moduleStatus(props.entry));
const readout = computed<CheckListItem[]>(() =>
  (props.entry.readout ?? []).map((line, index) => ({
    id: String(index),
    label: processI18n(line.text),
    state: READOUT_STATES[line.tone ?? "info"],
  })),
);
const title = computed(() => processI18n(props.entry.title));
</script>

<template>
  <DmsLink
    :to="props.to"
    class="group dms-card dms-card--interactive flex min-h-[228px] flex-col gap-3 overflow-hidden px-4 pt-4 text-inherit"
  >
    <div class="flex items-start justify-between gap-2.5">
      <DmsIconWell :icon="props.entry.icon" />
      <DmsStatusPill
        :tone="STATUS_TONES[status]"
        :label="t(`modules.status.${status}`)"
        size="sm"
        uppercase
      />
    </div>

    <DmsCheckList
      v-if="readout.length > 0"
      :items="readout"
      marker="glyph"
      size="xs"
      :tint-labels="false"
      truncate
      class="overflow-hidden"
    />

    <div
      class="text-highlighted mt-auto truncate text-lg font-[650] tracking-[-0.02em]"
    >
      {{ title }}
    </div>
    <p class="text-muted -mt-1.5 line-clamp-2 text-sm leading-[1.45]">
      {{ processI18n(props.entry.description) }}
    </p>

    <div
      class="text-dimmed -mx-4 mt-0.5 flex items-center gap-2 border-t border-(--ui-border-muted) bg-(--dms-bg-muted) py-[9px] ps-4 pe-3 font-mono text-[11px] font-medium"
    >
      <span v-if="props.entry.version" class="whitespace-nowrap">
        v{{ props.entry.version }}
      </span>
      <span v-if="status === 'update'" class="text-warning truncate">
        <template v-if="props.entry.version">·</template>
        {{ t("modules.update_available") }}
      </span>
      <span v-else class="truncate">
        <template v-if="props.entry.version">·</template>
        {{ processI18n(moduleCategory(props.entry)) }}
      </span>
      <span
        class="text-primary ms-auto inline-flex shrink-0 items-center gap-1 font-sans text-xs font-semibold"
      >
        {{ t("modules.open") }}
        <UIcon
          name="i-ph-arrow-right"
          class="size-3.5 transition-transform group-hover:translate-x-0.5"
          :aria-hidden="true"
        />
      </span>
    </div>
  </DmsLink>
</template>
