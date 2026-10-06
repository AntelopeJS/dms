import { formFieldInjectionKey } from "@nuxt/ui/composables/useFormField";
import { type InjectionKey, inject, onBeforeUnmount, ref } from "vue";

/** Where a form collects the errors its controls report, by field id. */
export interface FormControlErrors {
  report: (fieldId: string, message: string | undefined) => void;
}

export const FORM_CONTROL_ERRORS_KEY: InjectionKey<FormControlErrors> = Symbol(
  "dms-form-control-errors",
);

/**
 * Lets a control refuse what was typed into it (a duration or JSON it cannot
 * read): inside a form, the message becomes the field's error, which blocks
 * the submit and joins the form's summary like any other. `message` holds it
 * for a control used outside a form.
 */
export function useControlError() {
  const field = inject(formFieldInjectionKey, undefined);
  const errors = inject(FORM_CONTROL_ERRORS_KEY, null);
  const message = ref<string>();

  function report(next: string | undefined): void {
    if (message.value === next) return;
    message.value = next;
    const name = field?.value?.name;
    if (name) errors?.report(name, next);
  }

  onBeforeUnmount(() => report(undefined));

  return { message, report };
}
