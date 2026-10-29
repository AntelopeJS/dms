<script setup lang="ts">
import ModuleTile from "./ModuleTile.vue";
import ModuleManageMenu from "./ModuleManageMenu.vue";
import ModuleSourceLabel from "./ModuleSourceLabel.vue";
import ModuleStoreOperation from "./ModuleStoreOperation.vue";
import ModuleStoreRequirements from "./ModuleStoreRequirements.vue";
import type {
  CheckListItem,
  CheckListState,
} from "#dms-ui/app/components/check-list/CheckList.vue";
import type {
  ModuleCatalogEntry,
  ModuleReadoutTone,
} from "#dms-core/app/types/page";
import type { StoreOperationKind } from "#dms-core/app/types/module-store";
import { moduleCategory } from "../../../utils/modules-catalog";
import {
  type ModuleStoreEntry,
  type StoreAction,
  installedTileStatus,
  storeActions,
  storeBlockMessage,
} from "../../../utils/module-store-catalog";

interface ModuleCatalogTileProps {
  entry: ModuleCatalogEntry;
  /** Where Open leads: the module's landing page, when it has pages. */
  to?: string;
  /** What the module store says of it, when the store lists it. */
  storeEntry?: ModuleStoreEntry;
  /** Another module's operation runs, or the store is read-only. */
  isLocked?: boolean;
}

interface ModuleCatalogTileEmits {
  action: [kind: StoreOperationKind];
}

const props = withDefaults(defineProps<ModuleCatalogTileProps>(), {
  to: undefined,
  storeEntry: undefined,
  isLocked: false,
});
const emit = defineEmits<ModuleCatalogTileEmits>();
const { t } = useI18n();
const { processI18n } = useTranslation();

const TOOLTIP_CONTENT = { side: "top", sideOffset: 6 } as const;

const FOOTER_FACTS_CLASS = "flex grow basis-0 items-center gap-2";

const READOUT_STATES: Record<ModuleReadoutTone, CheckListState> = {
  success: "ok",
  info: "info",
  warning: "warn",
  error: "error",
};

const status = computed(() =>
  installedTileStatus(props.entry, props.storeEntry),
);
const readout = computed<CheckListItem[]>(() =>
  (props.entry.readout ?? []).map((line, index) => ({
    id: String(index),
    label: processI18n(line.text),
    state: READOUT_STATES[line.tone ?? "info"],
  })),
);
const title = computed(() => processI18n(props.entry.title));
const category = computed(() => processI18n(moduleCategory(props.entry)));

const actions = computed<StoreAction[]>(() =>
  props.storeEntry ? storeActions(props.storeEntry) : [],
);
/** The store action the button runs when there is nothing to open. */
const primary = computed<StoreAction | undefined>(() =>
  props.to ? undefined : actions.value.find((action) => !action.isMenuOnly),
);
const menuActions = computed(() =>
  actions.value.filter((action) => action !== primary.value),
);
const isOperating = computed(() => props.storeEntry?.operation !== undefined);

/** Why the button waits, when it does. */
const blockedReason = computed(() => {
  if (!primary.value || !props.storeEntry) return undefined;
  if (props.isLocked) return t("modules.store.locked");
  return storeBlockMessage(props.storeEntry, primary.value.kind, t);
});
const isBlocked = computed(() => blockedReason.value !== undefined);
</script>

<template>
  <ModuleTile
    :id="`module-${props.entry.id}`"
    :icon="props.entry.icon"
    :title="title"
    :description="processI18n(props.entry.description)"
    :status="{
      tone: status.tone,
      dot: status.dot,
      label: t(status.labelKey),
    }"
    is-solid
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

    <template v-if="props.storeEntry">
      <ModuleStoreOperation :entry="props.storeEntry" />
      <p
        v-if="!isOperating && props.storeEntry.state === 'pending'"
        class="text-xs text-(--ui-warning)"
      >
        {{ t("modules.store.pending_hint") }}
      </p>
      <ModuleStoreRequirements v-if="!isOperating" :entry="props.storeEntry" />
    </template>

    <template #footer>
      <!-- v0.5.0 · [icon] npm · Content, as the store tile says it: the
           state is the pill's to say. Only the category gives way to Open
           and Manage; the version and the source stay whole. -->
      <span :class="FOOTER_FACTS_CLASS">
        <span v-if="props.entry.version" class="shrink-0 whitespace-nowrap">
          v{{ props.entry.version }}
        </span>
        <template v-if="props.entry.source">
          <span v-if="props.entry.version" aria-hidden="true">·</span>
          <ModuleSourceLabel :source="props.entry.source" />
        </template>
        <span class="w-0 min-w-0 grow truncate" :title="category">
          <template v-if="props.entry.version || props.entry.source">
            ·
          </template>
          {{ category }}
        </span>
      </span>
      <span class="ms-auto flex shrink-0 items-center gap-1 font-sans">
        <UButton
          v-if="props.to"
          :to="props.to"
          size="xs"
          color="primary"
          variant="soft"
          trailing-icon="i-ph-arrow-right"
          :label="t('modules.open')"
        />
        <UTooltip
          v-else-if="primary"
          :text="blockedReason"
          :disabled="!blockedReason"
          :content="TOOLTIP_CONTENT"
        >
          <!-- aria-disabled rather than disabled: the button keeps its
               tooltip, which says why it waits. -->
          <UButton
            size="xs"
            :color="primary.kind === 'update' ? 'warning' : 'neutral'"
            variant="outline"
            :icon="primary.icon"
            :label="t(`modules.store.actions.${primary.labelKey}`)"
            :aria-disabled="isBlocked ? 'true' : undefined"
            :class="{ 'cursor-not-allowed opacity-50': isBlocked }"
            @click="!isBlocked && emit('action', primary.kind)"
          />
        </UTooltip>
        <ModuleManageMenu
          v-if="props.storeEntry && !props.isLocked"
          :entry="props.storeEntry"
          :actions="menuActions"
          @action="emit('action', $event)"
        />
      </span>
    </template>
  </ModuleTile>
</template>
