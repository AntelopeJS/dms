<script setup lang="ts">
import { computed } from "vue";

interface SaveBarProps {
  /** The bar only shows while there is something to save. */
  dirty: boolean;
  /** Spinner on the save button; both buttons are held. */
  saving?: boolean;
  /** Labels of the changed fields, listed after "Unsaved changes". */
  changes?: string[];
  /** Id of a form the save button submits, instead of emitting `save`. */
  form?: string;
  /** Save button label (i18n key with `$` or literal). */
  saveLabel?: string;
}

const props = withDefaults(defineProps<SaveBarProps>(), {
  saving: false,
  changes: () => [],
  form: undefined,
  saveLabel: undefined,
});

const emit = defineEmits<{
  discard: [];
  save: [];
}>();

const { t } = useI18n();
const { processI18n } = useTranslation();

const changedFields = computed(() =>
  props.changes.map((label) => processI18n(label)).join(", "),
);
const saveText = computed(() => {
  if (props.saving) return t("dms.save_bar.saving");
  return props.saveLabel
    ? processI18n(props.saveLabel)
    : t("dms.save_bar.save");
});
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-2 opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-2 opacity-0"
  >
    <!-- v2 .st-savebar: sticks to the bottom of the panel while the form is
         dirty, so saving never needs a scroll back. -->
    <div
      v-if="props.dirty"
      class="border-accented sticky bottom-4 z-5 mt-5 flex flex-wrap items-center gap-3 rounded-[10px] border bg-(--ui-bg) py-2.5 ps-4 pe-3 text-[13px] shadow-lg"
      role="status"
    >
      <span class="text-muted flex min-w-0 items-center gap-2">
        <span class="bg-warning size-[7px] shrink-0 rounded-full" />
        <span class="truncate max-sm:whitespace-normal">
          {{ t("dms.save_bar.unsaved") }}
          <template v-if="changedFields">· {{ changedFields }}</template>
        </span>
      </span>
      <div class="ms-auto flex items-center gap-2">
        <UButton
          :label="t('dms.save_bar.discard')"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="props.saving"
          @click="emit('discard')"
        />
        <UButton
          :label="saveText"
          size="sm"
          :loading="props.saving"
          :type="props.form ? 'submit' : 'button'"
          :form="props.form"
          @click="props.form ? undefined : emit('save')"
        />
      </div>
    </div>
  </Transition>
</template>
