import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import { DEFAULT_TENANT_ID } from "../../constants";
import type {
  RequestAuthenticator,
  RequestPrincipal,
} from "../request-authenticators";
import { resolveRequestPrincipal } from "./request-authenticators";
import { internal } from "../../auth";

const HTTP_UNAUTHORIZED = 401;
const UNAUTHORIZED_MESSAGE = "Unauthorized";

/**
 * Authenticate with route-local credential handlers, otherwise the existing JWT interfaces.
 * Recognized failures and ambiguous handlers never fall back to JWT. Every call revalidates;
 * repeat calls must retain the same credential, user and tenant. No permissions are granted.
 *
 * @internal
 */
export async function authenticateRequestPrincipal(
  ctx: RequestContext,
  authenticators: readonly RequestAuthenticator[] = [],
): Promise<RequestPrincipal> {
  return resolveRequestPrincipal(ctx, authenticators, async (token) => {
    const decoded = await internal.AuthUserAuthenticator(token);
    const user = await internal.AuthUserValidator(decoded);
    if (!user || typeof user === "boolean") {
      throw new HTTPResult(HTTP_UNAUTHORIZED, UNAUTHORIZED_MESSAGE);
    }
    return { user, tenantId: decoded.tenantId || DEFAULT_TENANT_ID };
  });
}
