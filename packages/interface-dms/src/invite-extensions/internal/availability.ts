import { Logging } from "@antelopejs/interface-core/logging";
import type { CustomButtonUnavailability } from "../../base/types/custom-button";
import type { ComponentFilterContext } from "../../component";
import { OwnedRegistry } from "../../utils/internal/owned-registry";
import type { InviteAvailabilityResolver } from "../availability";

/** @internal */
export const inviteAvailabilityResolvers =
  new OwnedRegistry<InviteAvailabilityResolver>();

async function resolveOne(
  resolver: InviteAvailabilityResolver,
  context: ComponentFilterContext,
): Promise<CustomButtonUnavailability | undefined> {
  try {
    return await resolver(context);
  } catch (error) {
    Logging.Error("[dms] an invite availability resolver failed:", error);
    return undefined;
  }
}

/**
 * The reason the first refusing resolver gives, in registration order;
 * `undefined` while every resolver leaves invitations available.
 *
 * @internal
 */
export async function ResolveInviteAvailability(
  context: ComponentFilterContext,
): Promise<CustomButtonUnavailability | undefined> {
  for (const resolver of inviteAvailabilityResolvers.values()) {
    const unavailability = await resolveOne(resolver, context);
    if (unavailability) return unavailability;
  }
  return undefined;
}
