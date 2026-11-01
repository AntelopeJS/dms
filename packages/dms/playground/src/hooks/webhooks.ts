import {
  Controller,
  HTTPResult,
  Parameter,
  Post,
} from "@antelopejs/interface-api";
import { recordHookEvent } from "./log";
import {
  WEBHOOK_SECRET,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOKS_API,
} from "./webhook-route";

const HTTP_UNAUTHORIZED = 401;

interface WebhookResult {
  received: boolean;
  provider: string;
}

/**
 * A provider's webhook: declared in the frontend module's `publicEndpoints`,
 * so the frontend server forwards it without an `Origin` or a session and
 * relays the signature header. The route authenticates the caller itself.
 */
export class PlaygroundWebhooksController extends Controller(WEBHOOKS_API) {
  @Post(":provider")
  receive(
    @Parameter("provider") provider: string,
    @Parameter(WEBHOOK_SIGNATURE_HEADER, "header") signature:
      | string
      | undefined,
  ): WebhookResult {
    if (signature !== WEBHOOK_SECRET) {
      throw new HTTPResult(HTTP_UNAUTHORIZED, "Bad signature");
    }
    recordHookEvent({
      icon: "i-ph-webhooks-logo",
      tone: "primary",
      title: "Webhook received",
      detail: `POST ${WEBHOOKS_API}/${provider}, signed, no session`,
    });
    return { received: true, provider };
  }
}
