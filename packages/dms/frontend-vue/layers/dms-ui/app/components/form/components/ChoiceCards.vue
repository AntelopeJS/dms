<script setup lang="ts">
import type { RadioGroupItem } from "@nuxt/ui/components/RadioGroup.vue";

type ChoiceValue = string | number;

interface ChoiceCardItem {
  label: string;
  value: ChoiceValue;
  description?: string;
  icon?: string;
  disabled?: boolean;
}

interface ChoiceCardsProps {
  id?: string;
  items: ChoiceCardItem[];
  /** Several cards picked: the value is the list of theirs. */
  multiple?: boolean;
  disabled?: boolean;
  /**
   * Cards per row once the field is 480px wide; one column below it.
   * Defaults to 2: three options then wrap 2 + 1, `3` keeps them on one row.
   */
  columns?: number;
}

const DEFAULT_COLUMNS = 2;

const props = withDefaults(defineProps<ChoiceCardsProps>(), {
  id: undefined,
  multiple: false,
  disabled: false,
  columns: DEFAULT_COLUMNS,
});
const model = defineModel<ChoiceValue | ChoiceValue[] | null | undefined>();

// Nuxt UI's choice cards, as the v2 theme draws them: the options side by
// side, wrapping, each with its description. The column count is a custom
// property, so any `columns` needs no class of its own.
const CARDS_UI = {
  fieldset:
    "grid gap-2.5 @min-[480px]:grid-cols-[repeat(var(--dms-choice-columns),minmax(0,1fr))]",
};

const columnsStyle = computed(() => ({
  "--dms-choice-columns": String(Math.max(1, Math.round(props.columns))),
}));

const items = computed(() => props.items as unknown as RadioGroupItem[]);
const pickedMany = computed<ChoiceValue[]>({
  get: () => (Array.isArray(model.value) ? model.value : []),
  set: (value) => (model.value = value),
});
const pickedOne = computed<ChoiceValue | undefined>({
  get: () =>
    Array.isArray(model.value) ? undefined : (model.value ?? undefined),
  set: (value) => (model.value = value),
});
</script>

<template>
  <div class="@container" :style="columnsStyle">
    <UCheckboxGroup
      v-if="props.multiple"
      :id="props.id"
      v-model="pickedMany"
      :items="items"
      :disabled="props.disabled"
      variant="card"
      :ui="CARDS_UI"
    />
    <URadioGroup
      v-else
      :id="props.id"
      v-model="pickedOne"
      :items="items"
      :disabled="props.disabled"
      variant="card"
      :ui="CARDS_UI"
    />
  </div>
</template>
