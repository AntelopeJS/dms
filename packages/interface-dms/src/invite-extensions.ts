/**
 * Module data carried by a member invitation — the invitation-side counterpart
 * of `@RegisterPageExtension`, split by concern under `./invite-extensions/`:
 *
 * - `types` — the contracts a contributor implements
 * - `registry` — `RegisterInviteExtension` and the registration proxy that
 *   binds an extension to its module's lifetime
 * - `availability` — `RegisterInviteAvailability`, which disables the invite
 *   action with a reason
 *
 * The rest is driven by the DMS runtime alone and lives under
 * `./invite-extensions/internal/`: the namespacing of contributed fields
 * (`field-ids`), their serialization, placement and merging into the DMS
 * invite modal (`form-slot`), validation at submit, delivery at acceptance and
 * cleanup (`delivery`), and the prefill, validation and notification of a
 * pending invitation's edit (`edit`).
 *
 * `form-slot` claims the invite forms' component slots on import, so importing
 * this barrel is what opens the modal and the edit form to extensions.
 */
import "./invite-extensions/internal/form-slot";
import * as availability from "./invite-extensions/internal/availability";
import { internal as registry } from "./invite-extensions/registry";

export {
  type InviteAvailabilityResolver,
  RegisterInviteAvailability,
} from "./invite-extensions/availability";
export * from "./invite-extensions/registry";
export * from "./invite-extensions/types";

// Shadows the namespace registry.ts declares: the same proxy, plus
// `ResolveInviteAvailability`, which module tests reach through it.

/**
 * @internal
 */
export namespace internal {
  export const RegisterInviteExtension = registry.RegisterInviteExtension;

  /** Kept for module compatibility; the DMS imports it from `internal/availability`. */
  export const ResolveInviteAvailability =
    availability.ResolveInviteAvailability;
}
