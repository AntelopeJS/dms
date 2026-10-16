<script setup lang="ts">
import ModuleTile from "./ModuleTile.vue";
import ModuleStoreRequirements from "./ModuleStoreRequirements.vue";
import {
  type ModuleStoreEntry,
  type StoreAction,
  type StoreActionBlock,
  storeActionBlock,
  storeActions,
  storeTileStatus,
} from "../../../utils/module-store-catalog";
import type {
  StoreOperationKind,
  StoreOperationStep,
} from "../../../../types/module-store";

interface ModuleStoreTileProps {
  /** The store module the tile presents. */
  entry: ModuleStoreEntry;
  /** Another module's operation runs: every action waits for it. */
  isLocked?: boolean;
}

interface ModuleStoreTileEmits {
  action: [kind: StoreOperationKind];
}

const props = withDefaults(defineProps<ModuleStoreTileProps>(), {
  isLocked: false,
});
const emit = defineEmits<ModuleStoreTileEmits>();
const { t } = useI18n();
const { processI18n } = useTranslation();

const TOOLTIP_CONTENT = { side: "top", sideOffset: 6 } as const;
/** The steps an operation shows, in the order they run. */
const PROGRESS_STEPS: StoreOperationStep[] = [
  "resolve",
  "dependencies",
  "unload",
  "load",
  "save",
];
/**
 * Steps an operation of this kind goes through. The file is written last:
 * it only ever names a module that loaded.
 */
const KIND_STEPS: Record<StoreOperationKind, StoreOperationStep[]> = {
  install: ["resolve", "dependencies", "load", "save"],
  update: ["resolve", "unload", "load", "save"],
  enable: ["load", "save"],
  disable: ["unload", "save"],
  uninstall: ["unload", "save"],
  apply: ["load"],
};

const status = computed(() => storeTileStatus(props.entry));
const actions = computed(() => storeActions(props.entry));
const primary = computed<StoreAction | undefined>(() =>
  actions.value.find((action) => !action.isMenuOnly),
);
const secondary = computed(() =>
  actions.value
    .filter((action) => action !== primary.value)
    .map((action) => ({
      label: t(`modules.store.actions.${action.labelKey}`),
      icon: action.icon,
      color: action.kind === "uninstall" ? ("error" as const) : undefined,
      disabled: storeActionBlock(props.entry, action.kind) !== undefined,
      onSelect: () => emit("action", action.kind),
    })),
);

const isInstalledHere = computed(
  () => props.entry.installedVersion !== undefined,
);
const LIST_SEPARATOR = ", ";

const BLOCK_MESSAGES: Record<StoreActionBlock, () => string> = {
  no_release: () => t("modules.store.no_release"),
  incompatible: () =>
    t("modules.store.incompatible", {
      range: props.entry.requiredInterfaceRange ?? "",
    }),
  frontend: () =>
    t("modules.store.frontend_requirement.needs", {
      range: props.entry.frontendRequirement?.range ?? "",
      running: props.entry.frontendRequirement?.running ?? "",
    }),
  interfaces: () =>
    t("modules.store.requires_first", {
      interfaces: props.entry.missingInterfaces
        .map((missing) => missing.interfacePackage)
        .join(LIST_SEPARATOR),
    }),
  dependents: () =>
    t("modules.store.used_by", {
      modules: props.entry.dependents.join(LIST_SEPARATOR),
    }),
};

/** Why the main action waits, when it does. */
const blockedReason = computed(() => {
  if (props.isLocked) return t("modules.store.locked");
  if (!primary.value) return undefined;
  const block = storeActionBlock(props.entry, primary.value.kind);
  return block ? BLOCK_MESSAGES[block]() : undefined;
});
const isBlocked = computed(() => blockedReason.value !== undefined);

const operation = computed(() => props.entry.operation);
/**
 * Whether the running install loads modules for missing interfaces. Kept
 * for the whole operation: once they run, the listing no longer misses them.
 */
const isInstallingDependencies = ref(false);
watch(
  operation,
  (running) => {
    if (!running) {
      isInstallingDependencies.value = false;
      return;
    }
    if (
      running.step === "dependencies" ||
      (running.kind === "install" && props.entry.missingInterfaces.length > 0)
    ) {
      isInstallingDependencies.value = true;
    }
  },
  { immediate: true },
);

const steps = computed(() => {
  const kind = operation.value?.kind;
  if (!kind) return [];
  const current = PROGRESS_STEPS.indexOf(operation.value.step);
  const kindSteps = KIND_STEPS[kind].filter(
    (step) => step !== "dependencies" || isInstallingDependencies.value,
  );
  return kindSteps.map((step) => {
    const index = PROGRESS_STEPS.indexOf(step);
    const state =
      index < current ? "done" : index === current ? "running" : "todo";
    return { step, state };
  });
});

const STEP_ICONS: Record<string, string> = {
  done: "i-ph-check-circle-fill",
  running: "i-ph-circle-notch",
  todo: "i-ph-circle",
};

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
    :status="{
      tone: status.tone,
      dot: status.dot,
      label: t(`modules.store.state.${status.labelKey}`),
    }"
    :is-solid="isInstalledHere"
  >
    <!-- Running operation: its steps, the current one spinning. -->
    <ol
      v-if="steps.length > 0"
      class="flex flex-col gap-1 text-xs"
      :aria-label="t(`modules.store.progress.${operation?.kind}`)"
    >
      <li
        v-for="{ step, state } in steps"
        :key="step"
        class="flex items-center gap-1.5"
        :class="state === 'todo' ? 'text-dimmed' : 'text-toned'"
      >
        <UIcon
          :name="STEP_ICONS[state]"
          class="size-3.5 shrink-0"
          :class="{
            'animate-spin text-(--ui-primary)': state === 'running',
            'text-(--ui-success)': state === 'done',
          }"
        />
        {{ t(`modules.store.steps.${step}`) }}
      </li>
    </ol>

    <p
      v-else-if="props.entry.state === 'error' && props.entry.error"
      class="rounded-[8px] bg-(--ui-error)/8 px-2.5 py-1.5 text-xs text-(--ui-error)"
      :title="props.entry.error"
    >
      <span class="line-clamp-3 break-words">{{ props.entry.error }}</span>
    </p>

    <p
      v-else-if="props.entry.state === 'pending'"
      class="text-xs text-(--ui-warning)"
    >
      {{ t("modules.store.pending_hint") }}
    </p>

    <!-- The npm package the module comes from. -->
    <div
      v-else
      class="text-dimmed flex h-[30px] min-w-0 items-center rounded-[8px] border border-(--ui-border) bg-(--dms-bg-muted) px-2.5 font-mono text-[11.5px]"
      :title="props.entry.package"
    >
      <span class="truncate">{{ props.entry.package }}</span>
    </div>

    <ModuleStoreRequirements v-if="steps.length === 0" :entry="props.entry" />

    <template #footer>
      <span class="truncate">
        {{ processI18n(props.entry.catalogCategory) }}
      </span>
      <span
        v-if="versionLabel"
        class="shrink-0"
        :class="props.entry.updateAvailable ? 'text-(--ui-warning)' : ''"
      >
        {{ versionLabel }}
      </span>
      <span class="ms-auto flex shrink-0 items-center gap-1 font-sans">
        <UTooltip
          v-if="primary"
          :text="blockedReason"
          :disabled="!blockedReason"
          :content="TOOLTIP_CONTENT"
        >
          <!-- aria-disabled rather than disabled: the button keeps its
               tooltip, which says why it waits. -->
          <UButton
            size="xs"
            :color="primary.kind === 'update' ? 'warning' : 'neutral'"
            :variant="primary.kind === 'install' ? 'solid' : 'outline'"
            :icon="primary.icon"
            :label="t(`modules.store.actions.${primary.labelKey}`)"
            :aria-disabled="isBlocked ? 'true' : undefined"
            :class="{ 'cursor-not-allowed opacity-50': isBlocked }"
            @click="!isBlocked && emit('action', primary.kind)"
          />
        </UTooltip>
        <UDropdownMenu
          v-if="secondary.length > 0 && !props.isLocked"
          :items="secondary"
          :content="{ align: 'end' }"
        >
          <UButton
            v-if="primary"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-ph-dots-three-vertical"
            :aria-label="t('modules.store.more_actions')"
          />
          <UButton
            v-else
            size="xs"
            color="neutral"
            variant="outline"
            trailing-icon="i-ph-caret-down"
            :label="t('modules.store.actions.manage')"
          />
        </UDropdownMenu>
      </span>
    </template>
  </ModuleTile>
</template>
