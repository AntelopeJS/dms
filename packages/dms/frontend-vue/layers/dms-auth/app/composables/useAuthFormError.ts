export interface AuthFormError {
  title: string;
  description: string;
}

/**
 * The error an auth form shows inline, above its fields, instead of a toast
 * that disappears before it is read. Translated when set, so it can be set
 * after an `await` without the i18n context.
 */
export function useAuthFormError() {
  const { t } = useI18n();
  const formError = ref<AuthFormError | null>(null);

  function showFormError(error: unknown, titleKey: string): void {
    formError.value = {
      title: t(titleKey),
      description: resolveApiMessage(t, resolveApiErrorMessage(error)),
    };
  }

  function clearFormError(): void {
    formError.value = null;
  }

  return { formError, showFormError, clearFormError };
}
