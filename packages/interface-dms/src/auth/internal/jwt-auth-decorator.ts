import type { RequestContext } from "@antelopejs/interface-api";
import { SetParameterProvider } from "@antelopejs/interface-api";
import { MakeParameterAndPropertyAndClassDecorator } from "@antelopejs/interface-core/decorators";
import { DEFAULT_TENANT_ID } from "../../constants";
import { bindVerifiedRequestPrincipal } from "./request-authenticators";

const CLASS_PROVIDER_DESCRIPTION = "authentication-class-provider";

interface VerifiedToken {
  tenantId?: string;
}

type Authenticator<T> = (token: string | undefined) => T | Promise<T>;
type Validator<T, R> = (data: T) => R | Promise<R>;

function bearerToken(ctx: RequestContext): string | undefined {
  const header = ctx.rawRequest?.headers?.authorization;
  return typeof header === "string" ? header.split(" ")[1] : undefined;
}

function isVerifiedUser(value: unknown): value is { _id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { _id?: unknown })._id === "string"
  );
}

/**
 * `CreateAuthDecorator` for the DMS bearer token, which also binds the
 * verified user and tenant to the request: `getRequestTenantId` then answers
 * the tenant of a checked credential, never one read from an unverified token.
 * Applies to a parameter, a property or a class, like `CreateAuthDecorator`;
 * a validator passed to the decorator replaces the configured one.
 *
 * @internal
 */
export function CreateJwtAuthDecorator<
  T extends VerifiedToken | undefined,
  R,
>(callbacks: { authenticator: Authenticator<T>; validator: Validator<T, R> }) {
  return MakeParameterAndPropertyAndClassDecorator(
    (target, key, index, validator?: Validator<T, R>) => {
      const validate = validator ?? callbacks.validator;
      const provider = async (ctx: RequestContext): Promise<R> => {
        const data = await callbacks.authenticator(bearerToken(ctx));
        const result = await validate(data);
        if (data && isVerifiedUser(result)) {
          bindVerifiedRequestPrincipal(ctx, {
            userId: result._id,
            tenantId: data.tenantId || DEFAULT_TENANT_ID,
          });
        }
        return result;
      };
      if (key === undefined) {
        SetParameterProvider(
          (target as { prototype: object }).prototype,
          Symbol(CLASS_PROVIDER_DESCRIPTION),
          undefined,
          provider,
        );
        return;
      }
      SetParameterProvider(target, key, index, provider);
    },
  );
}
