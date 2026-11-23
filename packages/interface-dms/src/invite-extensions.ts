/**
 * Module data carried by a member invitation, the invitation-side counterpart
 * of `@RegisterPageExtension`.
 *
 * `./invite-extensions/internal/form-slot` claims the invite forms' component
 * slots on import, so importing this barrel is what opens the modal and the
 * edit form to extensions.
 *
 * @packageDocumentation
 */
import "./invite-extensions/internal/form-slot";

export {
  type InviteAvailabilityResolver,
  RegisterInviteAvailability,
} from "./invite-extensions/availability";
export * from "./invite-extensions/registry";
export * from "./invite-extensions/types";
