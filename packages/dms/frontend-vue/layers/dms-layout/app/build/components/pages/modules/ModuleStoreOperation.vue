<script setup lang="ts">
import type { ModuleStoreEntry } from "../../../utils/module-store-catalog";
import type {
  StoreOperationKind,
  StoreOperationStep,
} from "../../../../types/module-store";

// What the store is doing to a module, on whichever tile shows it: the steps
// of the running operation, the current one spinning, or the error the last
// one left.

interface ModuleStoreOperationProps {
  entry: ModuleStoreEntry;
}

const props = defineProps<ModuleStoreOperationProps>();
const { t } = useI18n();

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

const STEP_ICONS: Record<string, string> = {
  done: "i-ph-check-circle-fill",
  running: "i-ph-circle-notch",
  todo: "i-ph-circle",
};

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
</script>

<template>
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
</template>
