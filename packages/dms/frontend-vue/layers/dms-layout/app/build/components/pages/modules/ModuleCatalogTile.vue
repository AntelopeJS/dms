<script setup lang="ts">
import ModuleTile from "./ModuleTile.vue";
import type { Tone } from "#dms-ui/app/types/tone";
import type {
  CheckListItem,
  CheckListState,
} from "#dms-ui/app/components/check-list/CheckList.vue";
import type {
  ModuleCatalogEntry,
  ModuleReadoutTone,
  ModuleStatus,
} from "../../../../types/page";
import { moduleCategory, moduleStatus } from "../../../utils/modules-catalog";

interface ModuleCatalogTileProps {
  entry: ModuleCatalogEntry;
  /** Where the tile leads: the last page visited in the module, or its landing page. */
  to: string;
}

const props = defineProps<ModuleCatalogTileProps>();
const { t } = useI18n();
const { processI18n } = useTranslation();

// v2 .module-tile__state: a mono uppercase pill with a leading dot.
const STATUS_TONES: Record<ModuleStatus, Tone> = {
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
  <ModuleTile
    :to="props.to"
    :icon="props.entry.icon"
    :title="title"
    :description="processI18n(props.entry.description)"
    :status="{
      tone: STATUS_TONES[status],
      label: t(`modules.status.${status}`),
    }"
  >
    <template #readout>
      <DmsCheckList
        v-if="readout.length > 0"
        :items="readout"
        marker="glyph"
        size="xs"
        :tint-labels="false"
        truncate
        class="overflow-hidden"
      />
    </template>

    <template #footer>
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
    </template>
  </ModuleTile>
</template>
