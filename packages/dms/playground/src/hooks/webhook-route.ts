/**
 * The webhook's route, apart from its controller: the frontend module declares
 * it too, and `ajs dms build` loads that declaration without the API runtime.
 */
export const WEBHOOKS_API = "/api/playground/webhooks";
/** The header a provider signs its calls with, relayed by the proxy. */
export const WEBHOOK_SIGNATURE_HEADER = "x-playground-signature";
/** The playground's shared secret: a real module reads it from its config. */
export const WEBHOOK_SECRET = "dev";
