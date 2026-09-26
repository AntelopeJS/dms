import { randomUUID } from "node:crypto";
import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";

/** One active SaaS mode registration, told apart from the others by its id. */
export interface SaasModeRegistration {
  id: string;
}

/**
 * @internal
 */
export namespace internal {
  export const RegisterSaasMode = new RegisteringProxy<
    (registration: SaasModeRegistration) => void
  >();

  export const IsSaasModeRegistered = InterfaceFunction<() => boolean>();
}

/**
 * Put the DMS in SaaS mode, where platform ownership is independent from
 * tenant ownership:
 * - the default tenant's owner flag is no longer mirrored into `users.owner`,
 *   so becoming, or ceasing to be, an owner of the default tenant does not
 *   grant or revoke platform ownership;
 * - removing members no longer refuses to remove the last platform owner,
 *   since tenant owners are customers, not platform owners.
 *
 * The SaaS module (`dms-saas`) calls it from its `construct()`. The DMS names
 * no package and scans no module: this registration is the only signal.
 *
 * The registration is bound to the registering module: it is revoked when
 * that module unloads, and SaaS mode stays on while at least one registration
 * is active. Both behaviours read the mode per request, so calling it before
 * or after the DMS starts makes no difference.
 */
export function RegisterSaasMode(): void {
  internal.RegisterSaasMode.register({ id: randomUUID() });
}

/**
 * Whether a module currently holds a SaaS mode registration
 * (see `RegisterSaasMode`). False until one registers.
 */
export async function isSaasMode(): Promise<boolean> {
  return internal.IsSaasModeRegistered();
}
