import { Logging } from "@antelopejs/interface-core/logging";

/**
 * Run a promise in the background, logging failures instead of letting them
 * surface as unhandled rejections (which crash the process).
 */
export function fireAndForget(
  task: Promise<unknown>,
  description: string,
): void {
  task.catch((error) => {
    Logging.Error(`[DMS] Background ${description} failed: ${String(error)}`);
  });
}
