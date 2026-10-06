<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useUnsavedChanges } from "#dms-ui/app/composables/unsaved-changes/useUnsavedChanges";

interface SecurityEditPanelProps {
  /** Id of the form; the trigger and the panel ids derive from it. */
  formId: string;
  /** Label of the button that opens the panel. */
  triggerLabel: string;
  /** Muted hint shown in place of the button while the panel is open. */
  editingLabel: string;
  /**
   * Label of the submit button. It stays enabled: the parent checks the
   * fields on submit and flags the empty or wrong ones under them.
   */
  submitLabel: string;
  /** Spinner on the submit button while the request runs. */
  loading?: boolean;
  /** Disables the trigger button. */
  triggerDisabled?: boolean;
  /** Tooltip explaining why the trigger is disabled. */
  disabledReason?: string;
  /**
   * Whether the fields hold something not submitted yet: the submit button
   * and "Unsaved changes" show only then, and closing the panel (Cancel,
   * Escape) or leaving the page asks first.
   */
  dirty?: boolean;
}

interface SecurityEditPanelSlots {
  /** The row lead (a DmsListRow with the icon, the value and its meta). */
  label?: () => unknown;
  /** The form fields, laid out on the panel's two-column grid. */
  default?: () => unknown;
  /** Left of the Cancel / Submit buttons (a checkbox, a note). */
  footer?: () => unknown;
}

const props = withDefaults(defineProps<SecurityEditPanelProps>(), {
  loading: false,
  triggerDisabled: false,
  disabledReason: undefined,
  dirty: false,
});
defineSlots<SecurityEditPanelSlots>();

/** Whether the panel is open; the parent closes it after a successful save. */
const isOpen = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{
  /** Right before the panel opens: the parent resets its form. */
  open: [];
  /** The form was submitted (button or Enter). */
  submit: [];
}>();

const { t } = useI18n();
const form = ref<HTMLFormElement | null>(null);
const triggerId = `${props.formId}-trigger`;
const FIRST_FIELD = "input:not([type='hidden']):not([disabled]), textarea";

let focusOnMount = false;

function open(): void {
  emit("open");
  focusOnMount = true;
  isOpen.value = true;
}

// The collapsible mounts its content a few ticks after opening: the first
// field takes the focus as soon as the form exists.
watch(
  form,
  (element) => {
    if (!element || !focusOnMount) return;
    focusOnMount = false;
    element.querySelector<HTMLElement>(FIRST_FIELD)?.focus();
  },
  { flush: "post" },
);

const { isDirty, confirmLeave } = useUnsavedChanges({
  dirty: () => isOpen.value && props.dirty,
});

async function cancel(): Promise<void> {
  if (!(await confirmLeave())) return;
  isOpen.value = false;
}

// Closing (Cancel, Escape or a successful save) from inside the panel hands
// the focus back to the trigger instead of dropping it on the page.
watch(isOpen, async (value, previous) => {
  if (value || !previous) return;
  const active =
    typeof document === "undefined" ? null : document.activeElement;
  if (!form.value || !active || !form.value.contains(active)) return;
  await nextTick();
  document.getElementById(triggerId)?.focus();
});
</script>

<template>
  <DmsFieldRow>
    <template #label>
      <slot name="label" />
    </template>
    <span v-if="isOpen" class="text-muted text-xs">
      {{ props.editingLabel }}
    </span>
    <UTooltip
      v-else
      :text="props.disabledReason"
      :disabled="!props.triggerDisabled || !props.disabledReason"
    >
      <UButton
        :id="triggerId"
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-ph-pencil-simple"
        :label="props.triggerLabel"
        :disabled="props.triggerDisabled"
        :aria-expanded="isOpen"
        :aria-controls="props.formId"
        @click="open"
      />
    </UTooltip>
  </DmsFieldRow>

  <UCollapsible v-model:open="isOpen">
    <template #content>
      <form
        :id="props.formId"
        ref="form"
        :aria-label="props.editingLabel"
        novalidate
        class="border-muted grid grid-cols-2 gap-x-5 gap-y-4 border-t p-[18px] max-sm:grid-cols-1"
        @submit.prevent="emit('submit')"
        @keydown.esc.stop.prevent="cancel"
      >
        <slot />
        <div class="col-span-full flex flex-wrap items-center gap-2.5">
          <slot name="footer" />
          <DmsUnsavedStatus
            v-if="isDirty"
            :text="t('dms.save_bar.unsaved')"
            is-band
          />
          <div class="ms-auto flex items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :label="t('page.settings.security.cancel')"
              @click="cancel"
            />
            <UButton
              v-if="isDirty"
              type="submit"
              :loading="props.loading"
              :label="props.submitLabel"
            />
          </div>
        </div>
      </form>
    </template>
  </UCollapsible>
</template>
