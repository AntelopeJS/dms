<script setup lang="ts">
interface Props {
  containerId: string;
  message?: string;
}

const props = withDefaults(defineProps<Props>(), { message: "" });

const emit = defineEmits<{ success: [result: unknown] }>();

const note = ref("");

function confirm() {
  emit("success", { note: note.value, containerId: props.containerId });
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="message" class="text-muted text-sm">{{ message }}</p>
    <UFormField label="Note" help="Returned to the caller through the result promise">
      <UInput v-model="note" placeholder="Type something…" class="w-full" />
    </UFormField>
    <p class="text-dimmed text-xs">container-id: {{ containerId }}</p>
    <div class="flex justify-end gap-2">
      <UButton
        color="primary"
        icon="i-ph-check"
        label="Confirm & close"
        @click="confirm"
      />
    </div>
  </div>
</template>
