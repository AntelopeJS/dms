import { ref, type Ref } from "vue";
import type { LiveFormHandle } from "#dms-core/app/composables/useFormValidation";
import {
  type FieldErrorCode,
  resolveFieldErrors,
} from "#dms-core/app/composables/useFieldErrors";
import type { resolveApiErrorMessage } from "#dms-core/app/composables/resolveApiError";

const CORE_ERROR_KEY = "error.500.description";

export interface AuthFormError {
  title: string;
  description: string;
  severity: ApiErrorSeverity;
}

/** What an auth page's `UForm` exposes that a field error needs. */
export interface AuthFormHandle {
  setErrors: (errors: Array<{ name: string; message: string }>) => void;
  getErrors: (name?: string) => Array<{ id?: string; name?: string }>;
  validate: LiveFormHandle["validate"];
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
 * The errors of an auth form, following the dashboard's error rule: one that
 * belongs to a field shows under that field (marked invalid, focused), any
 * other shows inline above the fields (`AuthFormAlert`) instead of a toast
 * that disappears before it is read. Translated when set, so it can be set
 * after an `await` without the i18n context.
 *
 * A page served to a visitor carries only the messages its render read, and
 * the presenter's lookups do not load the rest, so the error messages are
 * loaded before any is resolved.
 *
 * `showError` resolves whether the error went under a field; `false` means it
 * went above the form.
 */
export function useAuthFormError() {
  const errorPresenter = useApiErrorPresenter();
  const { i18n } = getPluginI18n();
  const formError = ref<AuthFormError | null>(null);

  async function loadErrorMessages(): Promise<void> {
    if (!i18n.te(CORE_ERROR_KEY)) await i18n.setLocale(i18n.locale.value);
  }

  async function showFormError(
    error: Parameters<typeof resolveApiErrorMessage>[0],
    titleKey: string,
  ): Promise<void> {
    await loadErrorMessages();
    const notice = errorPresenter.resolveError(error, {
      fallbackKey: titleKey,
    });
    formError.value = notice
      ? { title: notice.message, description: "", severity: notice.severity }
      : null;
  }

  function clearFormError(): void {
    formError.value = null;
  }

  async function showError(
    error: Parameters<typeof resolveFieldErrors>[0],
    titleKey: string,
    target: AuthFieldErrorTarget,
  ): Promise<boolean> {
    const { fields } = resolveFieldErrors(error, {
      fields: target.fields,
      codes: target.codes,
    });
    const form = target.form?.value;
    if (fields.length === 0 || (!target.show && !form)) {
      await showFormError(error, titleKey);
      return false;
    }
    await loadErrorMessages();
    clearFormError();
    const messages = fields.map((entry) => ({
      name: entry.field,
      message:
        errorPresenter.resolveError(entry.message, {
          fallbackKey: entry.fallbackKey ?? "dms.field_errors.invalid",
          params: entry.params,
        })?.message ?? "",
    }));
    if (target.show) {
      for (const { name, message } of messages) target.show(name, message);
      return true;
    }
    if (!form) return false;
    form.setErrors(messages);
    focusFirstFormError(form);
    return true;
  }

  return { formError, showFormError, clearFormError, showError };
}
