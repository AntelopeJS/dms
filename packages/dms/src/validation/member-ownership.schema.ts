import { z } from "zod";

/** Body of the route that gives or takes a member's owner role. */
export const memberOwnershipSchema = z.object({
  isTenantOwner: z.boolean(),
});
