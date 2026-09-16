import { Logging } from "@antelopejs/interface-core/logging";
import type { MaybePromise } from "./types";

/**
 * Property a serialized component's options carry to open an extension point.
 * A component that declares one says "whoever owns this slot may rewrite my
 * options"; the page layout resolves every slot it finds on its way out, so a
 * contributor that registers long after the page did is still picked up.
 *
 * Slots exist because a component embedded in another component's options —
 * the form behind a table view's modal button, say — serializes synchronously,
 * once, when its host is declared. Nothing can be grafted onto it afterwards,
 * and re-serializing the host would drop the upload tokens its fields carry.
 */
export const COMPONENT_SLOT_KEY = "slotId";

export type SlotOptions = Record<string, unknown>;

/**
 * Rewrites the options of every component declaring the slot. Returning the
 * input unchanged is how a resolver says it has nothing to contribute.
 */
export type ComponentSlotResolver = (
  options: SlotOptions,
) => MaybePromise<SlotOptions>;

const slotResolvers = new Map<string, ComponentSlotResolver>();

/**
 * Claim a slot id. One resolver per id: two owners would each overwrite the
 * other's contribution depending on the order the tree is walked in.
 *
 * The last claim wins. Resolvers are registered from module scope, so a module
 * reload re-runs the claim with a fresh function identity — refusing it would
 * turn an import into a throw, and the reload would leave the slot owned by a
 * resolver whose module is gone.
 *
 * @param slotId Id components declare through {@link COMPONENT_SLOT_KEY}
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

function resolvableSlotIdOf(node: unknown): string | undefined {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return undefined;
  }
  const slotId = (node as SlotOptions)[COMPONENT_SLOT_KEY];
  if (typeof slotId !== "string" || !slotResolvers.has(slotId)) {
    return undefined;
  }
  return slotId;
}

function hasResolvableSlot(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(hasResolvableSlot);
  }
  if (!node || typeof node !== "object") {
    return false;
  }
  if (resolvableSlotIdOf(node)) {
    return true;
  }
  return Object.values(node).some(hasResolvableSlot);
}

/**
 * Children first, so a slot nested inside another one still resolves — and so
 * what a resolver contributes is never walked again, which would let a
 * contribution declaring the slot it was contributed to loop forever.
 */
async function resolveNode(node: unknown): Promise<void> {
  if (Array.isArray(node)) {
    for (const item of node) await resolveNode(item);
    return;
  }
  if (!node || typeof node !== "object") {
    return;
  }
  for (const value of Object.values(node)) await resolveNode(value);

  const slotId = resolvableSlotIdOf(node);
  const resolver = slotId ? slotResolvers.get(slotId) : undefined;
  if (!resolver) return;

  const target = node as SlotOptions;
  try {
    const resolved = await resolver(target);
    if (resolved === target) return;
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, resolved);
    // A resolver that throws leaves the component as its author declared it:
    // the screen still renders, without the contribution. Failing the whole
    // layout would take down a page over a contributor's bug.
  } catch (error) {
    Logging.Error(
      `[dms] component slot "${slotId}" could not be resolved:`,
      error,
    );
  }
}

/**
 * Resolve every registered slot found in a serialized options tree.
 *
 * Returns the input untouched when it declares no slot anyone owns; otherwise
 * a deep clone, since the tree it is given is the page's cached layout and is
 * shared by every request.
 */
export async function ResolveComponentSlots<T>(options: T): Promise<T> {
  if (!hasResolvableSlot(options)) {
    return options;
  }
  const cloned = structuredClone(options);
  await resolveNode(cloned);
  return cloned;
}
