import { Color } from "#dms-core/app/types/color";

const WARNING_TITLE_KEY = "$dms.form.warning_title";

/**
 * A response to an action that went through but left something the user has
 * to act on — an invitation created whose email did not leave. `warning` is
 * an API message (an i18n key or plain text), shown in place of the success
 * message.
 */
export interface WarningResponse {
  warning?: string;
}

export interface ResponseToast {
  color: Color;
  title: string;
  description?: string;
}

interface ResponseToastTranslation {
  processI18n: (key: string) => string;
  processApiMessage: (message: unknown) => string;
}

/** The warning a response carries, or `undefined` when it reports a plain success. */
export function readResponseWarning(response: unknown): string | undefined {
  if (!response || typeof response !== "object") return undefined;
  const { warning } = response as WarningResponse;
  return typeof warning === "string" && warning ? warning : undefined;
}

/** `success`, unless the response carries a warning, which is told instead. */
export function resolveResponseToast(
  response: unknown,
  success: ResponseToast,
  { processI18n, processApiMessage }: ResponseToastTranslation,
): ResponseToast {
  const warning = readResponseWarning(response);
  if (!warning) return success;
  return {
    color: Color.warning,
    title: processI18n(WARNING_TITLE_KEY),
    description: processApiMessage(warning),
  };
}
