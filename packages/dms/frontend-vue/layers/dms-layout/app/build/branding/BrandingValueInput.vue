<script setup lang="ts">
import { computed } from "vue";
import { variableProblem } from "./values";

/** One variable's value in one set, the DMS default as placeholder, its refusal under it. */
const props = defineProps<{
  name: string;
  value: string | undefined;
  placeholder: string | undefined;
  label: string;
}>();
const emit = defineEmits<{ update: [value: string] }>();

const { t } = useI18n();
const problem = computed(() =>
  props.value ? variableProblem(props.name, props.value) : undefined,
);
</script>

<template>
  <div class="flex min-w-0 flex-col gap-0.5">
    <UInput
      :model-value="props.value ?? ''"
      :placeholder="props.placeholder"
      :aria-label="props.label"
      :aria-invalid="problem !== undefined"
      :color="problem ? 'error' : 'neutral'"
      size="xs"
      class="w-full font-mono"
      @update:model-value="(next: unknown) => emit('update', String(next))"
    />
    <p v-if="problem" class="text-error text-xs">
      {{ t(`branding.problem.${problem}`) }}
    </p>
  </div>
</template>
