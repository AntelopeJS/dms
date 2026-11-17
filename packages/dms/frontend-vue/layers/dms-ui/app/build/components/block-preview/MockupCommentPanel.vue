<script setup lang="ts">
import type {
  MockupAnnotation,
  MockupAnnotationStatus,
  MockupIssue,
  MockupPageState,
} from "../../utils/mockup";
import MockupAnnotations from "./MockupAnnotations.vue";
import MockupIssues from "./MockupIssues.vue";

/**
 * Comment mode's right panel: the note being written on the picked block,
 * the spec's issues and the notes left so far.
 */
defineProps<{
  /** The spec pointer of the block a note is being written on. */
  pending: string | undefined;
  annotations: MockupAnnotation[];
  pages: MockupPageState[];
  issues: MockupIssue[];
}>();
const note = defineModel<string>("note", { required: true });
const emit = defineEmits<{
  save: [];
  cancel: [];
  status: [id: string, status: MockupAnnotationStatus];
}>();

const NOTE_MAX_LENGTH = 2000;

const { t } = useI18n();
</script>

<template>
  <aside
    class="border-default bg-default min-h-0 space-y-4 overflow-y-auto border-s p-4"
    :aria-label="t('dms.mockup.annotations')"
    data-dms-mockup-comment-panel
  >
    <div
      v-if="pending"
      class="border-primary/40 bg-elevated/50 space-y-2 rounded-lg border p-3"
      data-dms-mockup-compose
    >
      <code class="text-dimmed block text-[11px] break-all">
        {{ pending }}
      </code>
      <UTextarea
        v-model="note"
        class="w-full"
        :rows="3"
        autofocus
        :maxlength="NOTE_MAX_LENGTH"
        :placeholder="t('dms.mockup.note_placeholder')"
      />
      <div class="flex justify-end gap-2">
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          @click="emit('cancel')"
        >
          {{ t("dms.mockup.cancel") }}
        </UButton>
        <UButton
          size="sm"
          :disabled="!note.trim()"
          data-dms-mockup-save
          @click="emit('save')"
        >
          {{ t("dms.mockup.save") }}
        </UButton>
      </div>
    </div>
    <p v-else class="text-muted text-sm">
      {{ t("dms.mockup.annotate_hint") }}
    </p>
    <MockupIssues :issues="issues" />
    <MockupAnnotations
      :annotations="annotations"
      :pages="pages"
      @status="(id, status) => emit('status', id, status)"
    />
  </aside>
</template>
