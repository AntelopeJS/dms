import { ref, watch, type UnwrapRef } from "vue";
import type { Form, FormSchema } from "@nuxt/ui";
import type {
  FormServerFieldError,
  useForm,
} from "../../../composables/form/useForm";
import { fieldErrorPattern } from "./formEntryContext";
import {
  changedServerErrorFields,
  keptServerErrors,
  serverErrorValue,
  type KeptServerError,
  type PlacedServerError,
} from "./serverFieldErrors";

type ErrorTarget = Pick<
  UnwrapRef<Form<FormSchema>>,
  "setErrors" | "getErrors" | "errors"
>;

interface FormErrorsSource {
  target: () => ErrorTarget | null | undefined;
  isInstant: () => boolean;
  state: () => ReturnType<typeof useForm>["state"]["value"];
  focusField: (name: string | undefined) => Promise<void>;
}

function placeServerError(
  target: ErrorTarget,
  error: FormServerFieldError,
): void {
  const scope = fieldErrorPattern(error.name);
  target.setErrors([{ ...error, name: error.path ?? error.name }], scope);
  if (!error.path || target.getErrors(error.path).length) return;
  target.setErrors([error], scope);
}

/** Server refusals and client validation share the form's error summary and focus. */
export function formComponentErrors(source: FormErrorsSource) {
  const serverErrors = new Map<string, KeptServerError>();
  const showsErrorSummary = ref(false);

  function showFieldErrors(errors: FormServerFieldError[]): boolean {
    const target = source.target();
    if (!target) return false;
    if (!source.isInstant()) {
      target.setErrors([]);
      serverErrors.clear();
    }
    for (const error of errors) placeServerError(target, error);
    const shown = errors.filter(
      (error) => target.getErrors(fieldErrorPattern(error.name)).length,
    );
    for (const error of shown) {
      serverErrors.set(error.name, {
        value: serverErrorValue(source.state()[error.name]),
        errors: target
          .getErrors(fieldErrorPattern(error.name))
          .map(({ name, message }: PlacedServerError) => ({ name, message })),
      });
    }
    showsErrorSummary.value = shown.length > 0;
    void source.focusField(target.errors[0]?.name);
    return shown.length > 0;
  }

  function onValidationError(event: {
    errors: Array<{ name?: string }>;
  }): void {
    showsErrorSummary.value = true;
    void source.focusField(event.errors[0]?.name);
  }

  return {
    serverErrors,
    showsErrorSummary,
    showFieldErrors,
    onValidationError,
  };
}

/** Clears refusals after edits and keeps unchanged refusals across validation. */
export function watchFormComponentServerErrors(source: {
  state: ReturnType<typeof useForm>["state"];
  serverErrors: Map<string, KeptServerError>;
  target: () =>
    | Pick<UnwrapRef<Form<FormSchema>>, "clear" | "loading">
    | null
    | undefined;
}) {
  watch(
    source.state,
    (current) => {
      for (const name of changedServerErrorFields(
        source.serverErrors,
        current,
      )) {
        source.serverErrors.delete(name);
        source.target()?.clear(fieldErrorPattern(name));
      }
    },
    { deep: true },
  );
  return (current: typeof source.state.value) =>
    keptServerErrors(source.serverErrors, current, !!source.target()?.loading);
}
