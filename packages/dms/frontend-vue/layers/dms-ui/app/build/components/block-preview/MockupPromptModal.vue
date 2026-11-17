<script setup lang="ts">
import { computed } from "vue";
import { useCopyFeedback } from "../../composables/clipboard/useCopyFeedback";

/**
 * Shows a request no assistant claimed, for the developer to copy into the
 * AI tool they use. Open while `prompt` is set.
 */
const prompt = defineModel<string | undefined>("prompt", { required: true });

const { t } = useI18n();
const { copyText, isCopied, iconOf } = useCopyFeedback();

const isOpen = computed({
  get: () => prompt.value !== undefined,
  set: (open) => {
    if (!open) prompt.value = undefined;
  },
});
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="t('dms.mockup.prompt_title')"
    :description="t('dms.mockup.prompt_hint')"
  >
    <template #body>
      <p
        class="border-default bg-elevated text-default rounded-md border p-3 font-mono text-sm break-words whitespace-pre-wrap"
        data-dms-mockup-prompt
      >
        {{ prompt }}
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="isOpen = false">
          {{ t("dms.mockup.close") }}
        </UButton>
        <UButton
          :icon="iconOf(true)"
          data-dms-mockup-copy-prompt
          @click="prompt && copyText(prompt, true)"
        >
          {{ isCopied(true) ? t("dms.mockup.copied") : t("dms.mockup.copy") }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
