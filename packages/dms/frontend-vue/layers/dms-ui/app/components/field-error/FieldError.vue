<script setup lang="ts">
/**
 * The inline error under a form control: the one place a field-tied error
 * shows (no toast for it). Same look as the error line of `UFormField` in
 * the DMS form: warning icon, 12.5px, error ink.
 *
 * Give the control `aria-invalid` and `aria-describedby` = `id`
 * (`useFieldErrors().aria(field)` does both).
 */
interface FieldErrorProps {
  /** Id the control's `aria-describedby` points to. */
  id: string;
  /** The message, already translated; nothing renders without one. */
  message?: string | null;
}

const props = withDefaults(defineProps<FieldErrorProps>(), {
  message: undefined,
});
</script>

<template>
  <p
    v-if="props.message"
    :id="props.id"
    class="text-error flex items-start gap-1.5 text-[12.5px] leading-snug"
  >
    <UIcon name="i-ph-warning-circle" class="mt-px size-3.5 shrink-0" />
    <span>{{ props.message }}</span>
  </p>
</template>
