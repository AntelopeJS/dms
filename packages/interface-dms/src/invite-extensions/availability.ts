import type { CustomButtonAvailability } from "../base/types/custom-button";
import { inviteAvailabilityResolvers } from "./internal/availability";

/**
 * Decides, per request, whether members can be invited into the tenant right
 * now. Returning `undefined` leaves the invite action available.
 */
export type InviteAvailabilityResolver = CustomButtonAvailability;

/**
 * Mark the invite action unavailable, with a reason, for as long as a
 * condition of the module holds — a plan whose seats are all taken, say. The
 * DMS disables its invite button and shows the reason next to it.
 *
 * The resolver runs while the members page layout is built, once per request.
 * It only shapes the UI: a module that must refuse the invitation itself does
 * so from `Hook.INVITE_BEING_CREATED` and `Hook.MEMBER_BEING_ADDED`.
 *
 * The registration is bound to the registering module and lifted when it
 * stops.
 *
 * ```ts
 * RegisterInviteAvailability(async ({ tenantId }) =>
 *   (await hasFreeSeat(tenantId))
 *     ? undefined
 *     : { reason: "$saas.plan.seat_limit_reached" },
 * );
 * ```
 *
 * @returns Removes this resolver, for a module that drops it while staying
 * loaded.
 */
export function RegisterInviteAvailability(
  resolver: InviteAvailabilityResolver,
): () => void {
  inviteAvailabilityResolvers.add(resolver);
  return () =>
    inviteAvailabilityResolvers.remove((entry) => entry === resolver);
}
