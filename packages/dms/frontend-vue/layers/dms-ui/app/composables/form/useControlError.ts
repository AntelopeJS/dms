import { formFieldInjectionKey } from "@nuxt/ui/composables/useFormField";
import { inject, onBeforeUnmount, ref } from "vue";
import { FORM_CONTROL_ERRORS_KEY } from "../../build/composables/form/formControlErrors";

/**
 * Lets a control refuse what was typed into it (a duration or JSON it cannot
 * read): inside a form, the message becomes the field's error, which blocks
 * the submit and joins the form's summary like any other. `message` holds it
 * for a control used outside a form.
 *
 * Call it in the setup of a field's input component. `report(message)` sets
 * the error, `report(undefined)` clears it; the error is cleared when the
 * component unmounts.
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
