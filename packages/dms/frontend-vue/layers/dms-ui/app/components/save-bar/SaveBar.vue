<script setup lang="ts">
import { computed } from "vue";
import { tv } from "tailwind-variants";
import { type FormKind, saveBarState } from "../../composables/form/formFooter";

/**
 * `floating`: the v2 save bar, a card that sticks to the bottom of the panel
 * while the form runs past it. `band`: the footer band of a form card, a
 * drawer or a modal (its surface classes come from the form).
 */
export type SaveBarVariant = "floating" | "band";

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
  variant?: SaveBarVariant;
  /**
   * What the form edits (see `FormKind`): an `action` form's bar has no
   * "Unsaved changes", and resets instead of discarding.
   */
  kind?: FormKind;
  /**
   * Whether anything in the form can be changed: an `action` form nothing in
   * which can be changed shows its submit alone, all the time.
   */
  resettable?: boolean;
}

const props = withDefaults(defineProps<SaveBarProps>(), {
  saving: false,
  changes: () => [],
  form: undefined,
  saveLabel: undefined,
  cancellable: false,
  variant: "floating",
  kind: "record",
  resettable: true,
});

const emit = defineEmits<{
  discard: [];
  save: [];
  cancel: [];
}>();

const SECONDARY_LABELS: Record<FormKind, string> = {
  record: "dms.save_bar.discard",
  action: "dms.button.reset",
};

// Its states have the same height, and hidden it keeps its place (one line,
// whatever the changes): switching never moves the content around it.
const theme = tv({
  slots: {
    root: "flex items-center transition-[opacity,translate,visibility] duration-200 ease-out",
    status: "text-muted flex min-w-0 items-center gap-2",
    dot: "bg-warning size-[7px] shrink-0 rounded-full",
    actions: "ms-auto flex shrink-0 items-center gap-2",
  },
  variants: {
    variant: {
      floating: {
        root: "border-accented sticky bottom-4 z-5 mt-5 gap-3 rounded-[10px] border bg-(--ui-bg) py-2.5 ps-4 pe-3 text-[13px] shadow-lg",
      },
      band: {
        root: "gap-2",
        status: "text-[12.5px]",
        dot: "ring-warning/15 ring-3",
      },
    },
    hidden: {
      true: { root: "invisible translate-y-2 opacity-0" },
    },
  },
});

const BUTTONS = {
  floating: { size: "sm", discardVariant: "ghost" },
  band: { size: "lg", discardVariant: "outline" },
} as const;

const { t } = useI18n();
const { processI18n } = useTranslation();

const state = computed(() =>
  saveBarState({
    kind: props.kind,
    dirty: props.dirty,
    cancellable: props.cancellable,
    resettable: props.resettable,
  }),
);
const ui = computed(() =>
  theme({ variant: props.variant, hidden: state.value.isHidden }),
);
const buttons = computed(() => BUTTONS[props.variant]);

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
  <div
    :class="ui.root()"
    :inert="state.isHidden || undefined"
    :aria-hidden="state.isHidden || undefined"
  >
    <span v-if="state.showsStatus" :class="ui.status()" role="status">
      <span :class="ui.dot()" />
      <span class="truncate">
        <template v-if="props.dirty">
          {{ t("dms.save_bar.unsaved") }}
          <template v-if="changedFields">· {{ changedFields }}</template>
        </template>
      </span>
    </span>
    <div :class="ui.actions()">
      <UButton
        v-if="state.secondary === 'discard'"
        :label="t(SECONDARY_LABELS[props.kind])"
        color="neutral"
        :variant="buttons.discardVariant"
        :size="buttons.size"
        :disabled="props.saving"
        @click="emit('discard')"
      />
      <UButton
        v-else-if="state.secondary === 'cancel'"
        :label="t('dms.button.cancel')"
        color="neutral"
        variant="outline"
        :size="buttons.size"
        @click="emit('cancel')"
      />
      <UButton
        v-if="state.showsSubmit"
        :label="saveText"
        :size="buttons.size"
        :loading="props.saving"
        :disabled="state.isSubmitHeld"
        :type="props.form ? 'submit' : 'button'"
        :form="props.form"
        @click="props.form ? undefined : emit('save')"
      />
    </div>
  </div>
</template>
