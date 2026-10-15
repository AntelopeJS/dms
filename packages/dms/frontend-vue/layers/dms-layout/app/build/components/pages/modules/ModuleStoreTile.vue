<script setup lang="ts">
import ModuleTile from "./ModuleTile.vue";
import {
  type ModuleStoreEntry,
  type StoreAction,
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
  "unload",
  "load",
  "save",
];
/** Steps an operation of this kind goes through. */
const KIND_STEPS: Record<StoreOperationKind, StoreOperationStep[]> = {
  install: ["resolve", "save", "load"],
  update: ["resolve", "unload", "save", "load"],
  enable: ["save", "load"],
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
      onSelect: () => emit("action", action.kind),
    })),
);

const isInstalledHere = computed(
  () =>
    props.entry.installedVersion !== undefined ||
    props.entry.state === "config",
);
/** Why the main action waits, when it does. */
const blockedReason = computed(() => {
  if (props.isLocked) return t("modules.store.locked");
  if (primary.value?.kind !== "install") return undefined;
  if (!props.entry.latestVersion) return t("modules.store.no_release");
  if (!props.entry.compatible) {
    return t("modules.store.incompatible", {
      range: props.entry.requiredInterfaceRange ?? "",
    });
  }
  return undefined;
});
const isBlocked = computed(() => blockedReason.value !== undefined);

const operation = computed(() => props.entry.operation);
const steps = computed(() => {
  const kind = operation.value?.kind;
  if (!kind) return [];
  const current = PROGRESS_STEPS.indexOf(operation.value.step);
  return KIND_STEPS[kind].map((step) => {
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

const versionLabel = computed(() => {
  const { installedVersion, latestVersion, operation: running } = props.entry;
  if (running?.targetVersion && installedVersion && running.kind === "update") {
    return `${installedVersion} → ${running.targetVersion}`;
  }
  if (props.entry.updateAvailable && installedVersion && latestVersion) {
    return `${installedVersion} → ${latestVersion}`;
  }
  return installedVersion ?? latestVersion;
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

    <p v-else-if="props.entry.state === 'config'" class="text-dimmed text-xs">
      {{ t("modules.store.config_hint") }}
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

    <template #footer>
      <span class="truncate">
        {{ processI18n(props.entry.catalogCategory) }}
      </span>
      <span
        v-if="versionLabel"
        class="shrink-0"
        :class="props.entry.updateAvailable ? 'text-(--ui-warning)' : ''"
      >
        v{{ versionLabel }}
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
