/**
 * Module data carried by a member invitation — the invitation-side counterpart
 * of `@RegisterPageExtension`, split by concern under `./invite-extensions/`:
 *
 * - `types` — the contracts a contributor implements
 * - `field-ids` — the namespacing of contributed fields inside the invite form
 * - `registry` — `RegisterInviteExtension` and the registration proxy that
 *   binds an extension to its module's lifetime
 * - `form-slot` — serialization, placement and merging of the contributed
 *   fields into the DMS invite modal
 * - `delivery` — validation at submit, delivery at acceptance, cleanup
 * - `edit` — prefill, validation and notification of a pending invitation's
 *   edit
 *
 * `form-slot` claims the invite forms' component slots on import, so importing
 * this barrel is what opens the modal and the edit form to extensions.
 */
export * from "./invite-extensions/delivery";
export * from "./invite-extensions/edit";
export * from "./invite-extensions/field-ids";
export * from "./invite-extensions/form-slot";
export * from "./invite-extensions/registry";
export * from "./invite-extensions/types";
