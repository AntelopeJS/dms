<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  /** The number of the version previewed. */
  seq: number;
  hasNewer: boolean;
  isRestoring: boolean;
}>();
const emit = defineEmits<{ restore: []; back: [] }>();

const { t } = useI18n();
const isConfirming = ref(false);

function confirm(): void {
  isConfirming.value = false;
  emit("restore");
}
</script>

<template>
  <div
    class="border-default bg-warning/10 flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 text-sm"
    role="status"
    data-dms-mockup-version-banner
  >
    <UIcon name="i-ph-clock-counter-clockwise" class="text-warning size-4" />
    <span class="text-highlighted font-medium">
      {{ t("dms.mockup.history_viewing", { number: seq }) }}
    </span>
    <span v-if="hasNewer" class="text-muted text-xs" data-dms-mockup-newer>
      {{ t("dms.mockup.history_newer") }}
    </span>
    <div class="ms-auto flex gap-2">
      <UButton
        size="xs"
        color="primary"
        icon="i-ph-arrow-u-up-left"
        :disabled="isRestoring"
        data-dms-mockup-restore
        @click="isConfirming = true"
      >
        {{ t("dms.mockup.history_restore") }}
      </UButton>
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        data-dms-mockup-back-to-current
        @click="emit('back')"
      >
        {{ t("dms.mockup.history_back") }}
      </UButton>
    </div>
    <UModal
      v-model:open="isConfirming"
      :title="t('dms.mockup.history_restore_title', { number: seq })"
    >
      <template #body>
        <p class="text-default text-sm">
          {{ t("dms.mockup.history_restore_body") }}
        </p>
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="ghost"
          data-dms-mockup-restore-cancel
          @click="isConfirming = false"
        >
          {{ t("dms.mockup.history_cancel") }}
        </UButton>
        <UButton
          color="primary"
          data-dms-mockup-restore-confirm
          @click="confirm"
        >
          {{ t("dms.mockup.history_restore") }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
