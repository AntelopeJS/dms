<script setup lang="ts">
import type { SectionRemoval } from "../../composables/block-preview/useMockupSectionWrites";

/**
 * Asks before a section that holds pages is deleted: its pages move to the
 * default section.
 */
defineProps<{ removing: SectionRemoval | undefined }>();
const emit = defineEmits<{ cancel: []; confirm: [] }>();

const { t } = useI18n();
</script>

<template>
  <UModal
    :open="removing !== undefined"
    :title="
      t('dms.mockup.section_delete_title', { title: removing?.title ?? '' })
    "
    @update:open="(open: boolean) => !open && emit('cancel')"
  >
    <template #body>
      <p class="text-muted text-sm" data-dms-mockup-section-delete-pages>
        {{
          t(
            "dms.mockup.section_delete_pages",
            { count: removing?.count ?? 0 },
            removing?.count ?? 0,
          )
        }}
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="emit('cancel')">
          {{ t("dms.mockup.cancel") }}
        </UButton>
        <UButton
          color="error"
          data-dms-mockup-section-delete-confirm
          @click="emit('confirm')"
        >
          {{ t("dms.mockup.section_delete_confirm") }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
