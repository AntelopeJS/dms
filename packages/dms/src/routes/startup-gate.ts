import {
  Controller,
  HandlerPriority,
  HTTPResult,
  Prefix,
} from "@antelopejs/interface-api";

const HTTP_SERVICE_UNAVAILABLE = 503;
const RETRY_AFTER_SECONDS = "1";
const ERROR_STARTING = "error.server_starting";

let schemasRegistered = false;

/**
 * Opens or closes the startup gate. `start()` opens it once both DMS schemas
 * are registered, `stop()` closes it before anything is torn down.
 *
 * @param registered Whether every DMS schema is bound
 */
export function setSchemasRegistered(registered: boolean): void {
  schemasRegistered = registered;
}

/**
 * Holds every request until the DMS schemas are bound. The api module starts
 * listening on its own, before the DMS `start()` has registered its schemas, so
 * a request in that window would reach a tenant-scoped model and fail with a
 * 500. It gets a 503 with `Retry-After` instead. It runs after the api's CORS
 * prefix, so a preflight is still answered and a browser can read the 503.
 */
export class StartupGateController extends Controller("") {
  @Prefix("any", "/", HandlerPriority.HIGH)
  gate(): HTTPResult | undefined {
    if (schemasRegistered) {
      return undefined;
    }
    const result = new HTTPResult(HTTP_SERVICE_UNAVAILABLE, ERROR_STARTING);
    result.addHeader("Retry-After", RETRY_AFTER_SECONDS);
    return result;
  }
}
