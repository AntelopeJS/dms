import { Logging } from "@antelopejs/interface-core/logging";
import type { MaybePromise } from "./types";
import { slotResolvers } from "./internal/component-slots";

export type SlotOptions = Record<string, unknown>;

/**
 * Rewrites the options of every component declaring the slot. Returning the
 * input unchanged is how a resolver says it has nothing to contribute.
 */
export type ComponentSlotResolver = (
  options: SlotOptions,
) => MaybePromise<SlotOptions>;

/**
 * Claim a slot id. One resolver per id: two owners would each overwrite the
 * other's contribution depending on the order the tree is walked in.
 *
 * The last claim wins. Resolvers are registered from module scope, so a module
 * reload re-runs the claim with a fresh function identity — refusing it would
 * turn an import into a throw, and the reload would leave the slot owned by a
 * resolver whose module is gone.
 *
 * @param slotId Id components declare through their `slotId` option
 * @param resolver Called once per declaring component, per layout request
 * @returns Releases the slot
 */
export function RegisterComponentSlot(
  slotId: string,
  resolver: ComponentSlotResolver,
): () => void {
  const existing = slotResolvers.get(slotId);
  if (existing && existing !== resolver) {
    Logging.Warn(
      `[dms] component slot "${slotId}" already had a resolver; the latest one now owns it.`,
    );
  }
  slotResolvers.set(slotId, resolver);
  return () => {
    if (slotResolvers.get(slotId) === resolver) {
      slotResolvers.delete(slotId);
    }
  };
}
