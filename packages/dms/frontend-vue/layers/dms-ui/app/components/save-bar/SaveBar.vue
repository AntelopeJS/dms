<script setup lang="ts">
import { computed } from "vue";

interface SaveBarProps {
  /** Whether there is something to save: "Unsaved changes", Discard, Save. */
  dirty: boolean;
  /** Spinner on the save button; both buttons are held. */
  saving?: boolean;
  /** Labels of the changed fields, listed after "Unsaved changes". */
  changes?: string[];
  /** Id of a form the save button submits, instead of emitting `save`. */
  form?: string;
  /** Save button label (i18n key with `$` or literal). */
  saveLabel?: string;
  /**
   * With nothing to save, the bar shows a Cancel button (emitting `cancel`)
   * instead of hiding: a form page the user leaves from there.
   */
  cancellable?: boolean;
}

const props = withDefaults(defineProps<SaveBarProps>(), {
  saving: false,
  changes: () => [],
  form: undefined,
  saveLabel: undefined,
  cancellable: false,
});

const emit = defineEmits<{
  discard: [];
  save: [];
  cancel: [];
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
// Hidden while there is nothing to save, unless it offers Cancel then.
const isHidden = computed(() => !props.dirty && !props.cancellable);
</script>

<template>
  <!-- v2 .st-savebar: sticks to the bottom of the panel while the form runs
       past it, so saving never needs a scroll back; it sits under the
       fields when they fit. Its two states (Cancel, or "Unsaved changes"
       with Discard and Save) have the same height, and hidden it keeps its
       place (one line, whatever the changes): switching never moves the
       content around it. -->
  <div
    class="border-accented sticky bottom-4 z-5 mt-5 flex items-center gap-3 rounded-[10px] border bg-(--ui-bg) py-2.5 ps-4 pe-3 text-[13px] shadow-lg transition-[opacity,translate,visibility] duration-200 ease-out"
    :class="isHidden && 'invisible translate-y-2 opacity-0'"
    :inert="isHidden || undefined"
    :aria-hidden="isHidden || undefined"
  >
    <span
      v-if="props.dirty || isHidden"
      class="text-muted flex min-w-0 items-center gap-2"
      role="status"
    >
      <span class="bg-warning size-[7px] shrink-0 rounded-full" />
      <span class="truncate">
        <template v-if="props.dirty">
          {{ t("dms.save_bar.unsaved") }}
          <template v-if="changedFields">· {{ changedFields }}</template>
        </template>
      </span>
    </span>
    <div class="ms-auto flex shrink-0 items-center gap-2">
      <template v-if="props.dirty || isHidden">
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
      </template>
      <UButton
        v-else
        :label="t('dms.button.cancel')"
        color="neutral"
        variant="outline"
        size="sm"
        @click="emit('cancel')"
      />
    </div>
  </div>
</template>
