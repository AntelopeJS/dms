import type { I18nTranslate } from "#dms-core/app/composables/translation/useTranslation";

/** Legacy fallback key for requests that could not reach the server. */
export const ACTION_ERROR_NETWORK_KEY = "error.network.description";
/** Legacy fallback key for permission refusals. */
export const ACTION_ERROR_FORBIDDEN_KEY = "dms.action_error.forbidden";
/** Fallback key for actions without a more specific context. */
export const ACTION_ERROR_GENERIC_KEY = "dms.action_error.generic";

/** @deprecated Capture useApiErrorPresenter().resolveError during setup instead. */
export function resolveActionError(
  error: unknown,
  _translate: I18nTranslate,
  _labelOf?: (field: string) => string | undefined,
): string {
  return (
    useApiErrorPresenter().resolveError(error, {
      fallbackKey: ACTION_ERROR_GENERIC_KEY,
    })?.message ?? ""
  );
}
