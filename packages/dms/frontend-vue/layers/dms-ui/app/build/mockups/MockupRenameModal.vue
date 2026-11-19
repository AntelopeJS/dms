<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import type { MockupSummary } from "../utils/mockup";
import { isMockupName } from "../utils/mockupCard";
import type { MockupRenameRequest } from "./manage";

/**
 * Renames a mockup: its title, which its card shows, and its name, the folder
 * under `mockups/`. Open while `mockup` is set. It sends only what changed.
 */
const mockup = defineModel<MockupSummary | undefined>("mockup", {
  required: true,
});
const props = defineProps<{ saving: boolean }>();
const emit = defineEmits<{ submit: [change: MockupRenameRequest] }>();

const { t } = useI18n();
const formId = useId();
const title = ref("");
const name = ref("");

watch(
  mockup,
  (current) => {
    title.value = current?.title ?? "";
    name.value = current?.name ?? "";
  },
  { immediate: true },
);

const isOpen = computed({
  get: () => mockup.value !== undefined,
  set: (open) => {
    if (!open) mockup.value = undefined;
  },
});

const change = computed((): MockupRenameRequest => {
  const trimmed = title.value.trim();
  return {
    ...(name.value !== mockup.value?.name && { name: name.value }),
    ...(trimmed !== "" &&
      trimmed !== mockup.value?.title && { title: trimmed }),
  };
});
const isNameInvalid = computed(
  () => name.value !== mockup.value?.name && !isMockupName(name.value),
);
const isTitleMissing = computed(
  () => Boolean(mockup.value?.title) && title.value.trim() === "",
);
const canSubmit = computed(
  () =>
    Object.keys(change.value).length > 0 &&
    !isNameInvalid.value &&
    !isTitleMissing.value &&
    !props.saving,
);

function submit(): void {
  if (canSubmit.value) emit("submit", change.value);
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="t('dms.mockup.rename_title')"
    :description="t('dms.mockup.rename_hint')"
  >
    <template #body>
      <form
        :id="formId"
        class="space-y-4"
        data-dms-mockup-rename-form
        @submit.prevent="submit"
      >
        <UFormField :label="t('dms.mockup.rename_title_label')">
          <UInput
            v-model="title"
            class="w-full"
            autofocus
            data-dms-mockup-rename-title
          />
        </UFormField>
        <UFormField
          :label="t('dms.mockup.rename_name_label')"
          :help="t('dms.mockup.rename_name_hint')"
          :error="isNameInvalid ? t('dms.mockup.rename_name_invalid') : false"
        >
          <UInput
            v-model="name"
            class="w-full font-mono"
            data-dms-mockup-rename-name
          />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="isOpen = false">
          {{ t("dms.mockup.cancel") }}
        </UButton>
        <UButton
          type="submit"
          :form="formId"
          :loading="saving"
          :disabled="!canSubmit"
          data-dms-mockup-rename-save
        >
          {{ t("dms.mockup.save") }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
