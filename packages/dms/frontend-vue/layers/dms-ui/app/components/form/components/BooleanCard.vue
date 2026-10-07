<script setup lang="ts">
interface BooleanCardProps {
  id?: string;
  /** Icon in a well at the start of the card. */
  icon?: string;
  /** Title of the card. */
  label?: string;
  description?: string;
  disabled?: boolean;
}

const props = defineProps<BooleanCardProps>();
const model = defineModel<boolean | null | undefined>();

const isOn = computed({
  get: () => model.value === true,
  set: (value: boolean) => (model.value = value),
});
</script>

<template>
  <!-- A choice that deserves more than a bare switch: a bordered row with
    its own title and explanation. -->
  <div
    class="border-default flex items-start gap-3 rounded-md border bg-(--dms-bg-muted) px-3.5 py-3"
  >
    <!-- No icon on phones: it left the text a narrow column. -->
    <span
      v-if="props.icon"
      class="border-default bg-default text-muted grid size-[34px] shrink-0 place-items-center rounded-[9px] border max-sm:hidden"
    >
      <UIcon :name="props.icon" class="size-[18px]" />
    </span>
    <label :for="props.id" class="min-w-0 flex-1 cursor-pointer">
      <b
        v-if="props.label"
        class="text-highlighted block text-[13px] font-semibold"
      >
        {{ props.label }}
      </b>
      <span
        v-if="props.description"
        class="text-muted mt-0.5 block text-[12.5px]/normal"
      >
        {{ props.description }}
      </span>
    </label>
    <USwitch
      :id="props.id"
      v-model="isOn"
      :disabled="props.disabled"
      class="mt-0.5"
    />
  </div>
</template>
