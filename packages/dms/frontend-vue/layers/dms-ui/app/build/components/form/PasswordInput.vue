<script setup lang="ts">
import { computed, useAttrs } from "vue";

// The one password input of the DMS (sign-in, new password, security
// settings, the form's PasswordType): a UInput whose Phosphor eye toggles
// the value's visibility. Attributes (`id`, `autocomplete`, `placeholder`,
// `size`, `aria-describedby`, listeners) go to the UInput.

interface PasswordInputProps {
  /** Rings the field in the error ink and marks it invalid. */
  invalid?: boolean;
  /** Writes "Show" / "Hide" on the toggle (a new password being chosen). */
  labelledToggle?: boolean;
  /** The lock icon before the value. */
  hasLockIcon?: boolean;
  disabled?: boolean;
}

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<PasswordInputProps>(), {
  invalid: false,
  labelledToggle: false,
  hasLockIcon: false,
  disabled: false,
});

const model = defineModel<string | undefined | null>();
/** Whether the value shows in clear; shared by a password and its confirmation. */
const isVisible = defineModel<boolean>("visible", { default: false });

const LOCK_ICON = "i-ph-lock-simple";
const SHOW_ICON = "i-ph-eye";
const HIDE_ICON = "i-ph-eye-slash";
const INVALID_BINDINGS = {
  color: "error",
  highlight: true,
  "aria-invalid": true,
} as const;

const attrs = useAttrs();
const controlledId = computed(() =>
  typeof attrs.id === "string" ? attrs.id : undefined,
);
const { t } = useI18n();

// Built on the attributes, not after them: a colour or an icon the caller
// passes stays unless this input has its own.
const inputBindings = computed(() => ({
  ...attrs,
  type: isVisible.value ? "text" : "password",
  ...(props.invalid && INVALID_BINDINGS),
  ...(props.hasLockIcon && { icon: LOCK_ICON }),
}));

const toggleAriaLabel = computed(() =>
  t(
    isVisible.value
      ? "dms.form.input.hide_password"
      : "dms.form.input.show_password",
  ),
);
const toggleLabel = computed(() =>
  props.labelledToggle
    ? t(isVisible.value ? "dms.form.input.hide" : "dms.form.input.show")
    : undefined,
);
</script>

<template>
  <UInput
    v-bind="inputBindings"
    v-model="model"
    :disabled="props.disabled"
    class="w-full"
    :ui="{ trailing: 'pe-1' }"
  >
    <template #trailing>
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        :square="!props.labelledToggle"
        :icon="isVisible ? HIDE_ICON : SHOW_ICON"
        :label="toggleLabel"
        :aria-label="toggleAriaLabel"
        :aria-pressed="isVisible"
        :aria-controls="controlledId"
        :disabled="props.disabled"
        @click="isVisible = !isVisible"
      />
    </template>
  </UInput>
</template>
