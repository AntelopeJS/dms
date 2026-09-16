<script setup lang="ts">
interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: "primary" | "error" | "warning";
}

interface ConfirmModalEmits {
  (e: "close", value: boolean): void;
}

const props = withDefaults(defineProps<ConfirmModalProps>(), {
  confirmColor: "primary",
});

const emit = defineEmits<ConfirmModalEmits>();

const isOpen = ref(true);

function handleConfirm() {
  isOpen.value = false;
  emit("close", true);
}

function handleCancel() {
  isOpen.value = false;
  emit("close", false);
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="props.title"
    @update:open="(v: boolean) => !v && handleCancel()"
  >
    <template #body>
      <p class="text-muted">{{ props.description }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :label="props.cancelLabel || $t('dms.confirm.cancel')"
          variant="outline"
          color="neutral"
          @click="handleCancel"
        />
        <UButton
          :label="props.confirmLabel || $t('dms.confirm.confirm')"
          :color="props.confirmColor"
          @click="handleConfirm"
        />
      </div>
    </template>
  </UModal>
</template>
