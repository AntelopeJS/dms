<script setup lang="ts">
import ModuleTile from "./ModuleTile.vue";
import ModuleSourceLabel from "./ModuleSourceLabel.vue";
import ModuleStoreOperation from "./ModuleStoreOperation.vue";
import ModuleStoreRequirements from "./ModuleStoreRequirements.vue";
import {
  type ModuleStoreEntry,
  type StoreAction,
  isInstalled,
  storeActions,
  storeBlockMessage,
} from "../../../utils/module-store-catalog";
import type { StoreOperationKind } from "../../../../types/module-store";

// A module of the catalog, as the store presents it: what it is, whether it
// is installed here, and Install when it is not. Everything else about an
// installed module is managed from its tile among the installed modules,
// which this one links to.

interface ModuleStoreTileProps {
  /** The store module the tile presents. */
  entry: ModuleStoreEntry;
  /** Another module's operation runs: every action waits for it. */
  isLocked?: boolean;
  /** Where the installed module's own tile is, the one that manages it. */
  installedTo?: string;
}

interface ModuleStoreTileEmits {
  action: [kind: StoreOperationKind];
}

const props = withDefaults(defineProps<ModuleStoreTileProps>(), {
  isLocked: false,
  installedTo: undefined,
});
const emit = defineEmits<ModuleStoreTileEmits>();
const { t } = useI18n();
const { processI18n } = useTranslation();

const TOOLTIP_CONTENT = { side: "top", sideOffset: 6 } as const;
const INSTALLED_STATUS = { tone: "primary", dot: "none" } as const;
const FOOTER_FACTS_CLASS = "flex min-w-0 items-center gap-2";

const isInstalledHere = computed(() => isInstalled(props.entry));
const isOperating = computed(() => props.entry.operation !== undefined);
/** Install, the one action a store tile offers, while it is not installed. */
const install = computed<StoreAction | undefined>(() =>
  storeActions(props.entry).find((action) => action.kind === "install"),
);

/** Why Install waits, when it does. */
const blockedReason = computed(() => {
  if (!install.value) return undefined;
  if (props.isLocked) return t("modules.store.locked");
  return storeBlockMessage(props.entry, install.value.kind, t);
});
const isBlocked = computed(() => blockedReason.value !== undefined);

const PLAIN_VERSION = /^\d/;

/** A version as the footer shows it: `v1.2.3`, or a range as written. */
function formatVersion(version: string): string {
  return PLAIN_VERSION.test(version) ? `v${version}` : version;
}

const versionLabel = computed(() => {
  const { installedVersion, latestVersion, operation: running } = props.entry;
  if (running?.targetVersion && installedVersion && running.kind === "update") {
    return `${formatVersion(installedVersion)} → ${formatVersion(running.targetVersion)}`;
  }
  if (props.entry.updateAvailable && installedVersion && latestVersion) {
    return `${formatVersion(installedVersion)} → ${formatVersion(latestVersion)}`;
  }
  const version = installedVersion ?? latestVersion;
  return version ? formatVersion(version) : undefined;
});
</script>

<template>
  <ModuleTile
    :icon="props.entry.icon"
    :title="processI18n(props.entry.title)"
    :description="processI18n(props.entry.description)"
    :status="
      isInstalledHere
        ? { ...INSTALLED_STATUS, label: t('modules.store.installed') }
        : undefined
    "
    :is-solid="isInstalledHere"
  >
    <ModuleStoreOperation :entry="props.entry" />

    <template v-if="!isOperating">
      <p v-if="props.entry.isWorkingCopy" class="text-dimmed text-xs">
        {{ t("modules.store.working_copy_hint") }}
      </p>

      <!-- The npm package the module comes from. -->
      <div
        v-else-if="!isInstalledHere"
        class="text-dimmed flex h-[30px] min-w-0 items-center rounded-[8px] border border-(--ui-border) bg-(--dms-bg-muted) px-2.5 font-mono text-[11.5px]"
        :title="props.entry.package"
      >
        <span class="truncate">{{ props.entry.package }}</span>
      </div>

      <ModuleStoreRequirements v-if="!isInstalledHere" :entry="props.entry" />

      <ULink
        v-if="isInstalledHere && props.installedTo"
        :to="props.installedTo"
        class="text-primary inline-flex items-center gap-1 text-xs font-semibold"
      >
        {{ t("modules.store.view_installed") }}
        <UIcon name="i-ph-arrow-right" class="size-3.5" :aria-hidden="true" />
      </ULink>
    </template>

    <template #footer>
      <!-- v0.5.0 · npm · Content, as on an installed module's tile, and
           kept whole the same way. -->
      <span :class="FOOTER_FACTS_CLASS">
        <span
          v-if="versionLabel"
          class="shrink-0"
          :class="props.entry.updateAvailable ? 'text-(--ui-warning)' : ''"
        >
          {{ versionLabel }}
        </span>
        <template v-if="props.entry.source">
          <span v-if="versionLabel" aria-hidden="true">·</span>
          <ModuleSourceLabel :source="props.entry.source" />
        </template>
        <span class="min-w-0 truncate">
          <template v-if="versionLabel || props.entry.source">·</template>
          {{ processI18n(props.entry.catalogCategory) }}
        </span>
      </span>
      <span class="ms-auto flex shrink-0 items-center gap-1 font-sans">
        <!-- An update is made where the module is managed. -->
        <UButton
          v-if="isInstalledHere && props.entry.updateAvailable"
          :to="props.installedTo"
          size="xs"
          color="warning"
          variant="soft"
          icon="i-ph-arrow-circle-up"
          :label="t('modules.store.update_available')"
        />
        <UTooltip
          v-else-if="install"
          :text="blockedReason"
          :disabled="!blockedReason"
          :content="TOOLTIP_CONTENT"
        >
          <!-- aria-disabled rather than disabled: the button keeps its
               tooltip, which says why it waits. -->
          <UButton
            size="xs"
            color="neutral"
            variant="solid"
            :icon="install.icon"
            :label="t(`modules.store.actions.${install.labelKey}`)"
            :aria-disabled="isBlocked ? 'true' : undefined"
            :class="{ 'cursor-not-allowed opacity-50': isBlocked }"
            @click="!isBlocked && emit('action', install.kind)"
          />
        </UTooltip>
      </span>
    </template>
  </ModuleTile>
</template>
