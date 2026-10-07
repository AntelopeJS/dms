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
}

const props = defineProps<ChoiceCardsProps>();
const model = defineModel<ChoiceValue | ChoiceValue[] | null | undefined>();

// Nuxt UI's choice cards, as the v2 theme draws them: the options side by
// side, wrapping, each with its description.
const CARDS_UI = {
  fieldset: "grid gap-2.5 @min-[480px]:grid-cols-2",
};

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
  <div class="@container">
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
