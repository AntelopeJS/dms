import { Logging } from "@antelopejs/interface-core/logging";
import type { FormPropsSerialized } from "./base/form-types";
import type { WatchAction } from "./base/types/watch";
import type { MaybePromise } from "./types";
import {
  slotResolvers,
  type SlotFormResolver,
} from "./internal/component-slots";

/**
 * The serialized options of the form that declares a slot: only a form has a
 * `slotId` option, so a resolver always receives a form's options, with the
 * `fields` array they carry.
 */
export type SlotOptions = FormPropsSerialized & {
  watchActions?: WatchAction[];
};

/**
 * Rewrites the options of every form declaring the slot. Returning the
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
  // SAFETY: The walker hands a resolver only the options of a dms-form component that carry a registered string slotId and a fields array (slotFormOptionsOf), and Form serializes its options as FormPropsSerialized.
  slotResolvers.set(slotId, resolver as SlotFormResolver);
  return () => {
    if (slotResolvers.get(slotId) === resolver) {
      slotResolvers.delete(slotId);
    }
  };
}
