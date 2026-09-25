const WIDGET_REQUEST_FAILED_MESSAGE = "[dms] Header widget request failed";

/**
 * Runs a request a layout widget issues on its own (on mount, on a realtime
 * event, on open). A failure -- a tenant access gate answering 403, a network
 * error -- is logged and degrades the widget through `onFailure` instead of
 * reaching the app error handler, which would replace the whole page with an
 * error screen.
 */
export async function settleWidgetRequest(
  request: () => Promise<unknown>,
  onFailure?: () => void,
): Promise<void> {
  try {
    await request();
  } catch (error) {
    onFailure?.();
    console.warn(WIDGET_REQUEST_FAILED_MESSAGE, error);
  }
}
