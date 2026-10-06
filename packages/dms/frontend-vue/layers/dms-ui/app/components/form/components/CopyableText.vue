<script setup lang="ts">
import DmsCopyButton from "../../copy/CopyButton.vue";

interface CopyableTextProps {
  id?: string;
  placeholder?: string;
}

const props = defineProps<CopyableTextProps>();
const model = defineModel<string | null | undefined>();
</script>

<template>
  <!-- A value to read and copy (a webhook URL): never edited here. -->
  <div class="flex min-w-0 items-center gap-2">
    <UInput
      :id="props.id"
      :model-value="model ?? ''"
      :placeholder="props.placeholder"
      readonly
      class="min-w-0 flex-1"
      :ui="{ base: 'font-mono text-[12.5px]' }"
    />
    <DmsCopyButton v-if="model" :value="model" />
  </div>
</template>
