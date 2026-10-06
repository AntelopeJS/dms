import { ref, type Ref } from "vue";
import {
  type FieldErrorCode,
  resolveFieldErrors,
} from "#dms-core/app/composables/useFieldErrors";
import { resolveApiErrorMessage } from "#dms-core/app/composables/useApiError";
import { resolveApiMessage } from "#dms-core/app/composables/translation/useTranslation";

export interface AuthFormError {
  title: string;
  description: string;
}

/** What an auth page's `UForm` exposes that a field error needs. */
export interface AuthFormHandle {
  setErrors: (errors: Array<{ name: string; message: string }>) => void;
  getErrors: (name?: string) => Array<{ id?: string; name?: string }>;
  validate: (options: { name: string; silent: boolean }) => Promise<unknown>;
}

/** Where an auth page shows the errors that belong to one of its fields. */
export interface AuthFieldErrorTarget {
  /** The fields of the page, by the name the API gives them. */
  fields: readonly string[];
  /** API error codes that belong to a field (`error.invalid_2fa_code`…). */
  codes?: Readonly<Record<string, FieldErrorCode>>;
  /** The page's `UForm`: the error goes under its `UFormField`. */
  form?: Ref<AuthFormHandle | null | undefined>;
  /** For a field outside a `UFormField` (the code cells): shows it itself. */
  show?: (field: string, message: string) => void;
}

/**
 * The errors of an auth form, following the dashboard's error rule: one that
 * belongs to a field shows under that field (marked invalid, focused), any
 * other shows inline above the fields (`AuthFormAlert`) instead of a toast
 * that disappears before it is read. Translated when set, so it can be set
 * after an `await` without the i18n context.
 */
export function useAuthFormError() {
  const { t } = useI18n();
  const translate = (key: string, params: Record<string, unknown> = {}) =>
    t(key, params);
  const formError = ref<AuthFormError | null>(null);

  function showFormError(error: unknown, titleKey: string): void {
    formError.value = {
      title: t(titleKey),
      description: resolveApiMessage(translate, resolveApiErrorMessage(error)),
    };
  }

  function clearFormError(): void {
    formError.value = null;
  }

  /**
   * Focuses the first field in error. A page disables its fields while the
   * request runs: the focus waits for its `finally` to enable them again.
   */
  function focusFirstFormError(form: AuthFormHandle): void {
    setTimeout(() => {
      const [first] = form.getErrors();
      if (first?.id) document.getElementById(first.id)?.focus();
    });
  }

  /**
   * Shows an API error under the field it belongs to, else above the form.
   *
   * @returns Whether it went under a field
   */
  async function showError(
    error: unknown,
    titleKey: string,
    target: AuthFieldErrorTarget,
  ): Promise<boolean> {
    const { fields } = resolveFieldErrors(error, {
      fields: target.fields,
      codes: target.codes,
    });
    const form = target.form?.value;
    if (fields.length === 0 || (!target.show && !form)) {
      showFormError(error, titleKey);
      return false;
    }
    clearFormError();
    const messages = fields.map((entry) => ({
      name: entry.field,
      message: resolveApiMessage(translate, entry.message),
    }));
    if (target.show) {
      for (const { name, message } of messages) target.show(name, message);
      return true;
    }
    form!.setErrors(messages);
    focusFirstFormError(form!);
    return true;
  }

  return { formError, showFormError, clearFormError, showError };
}
