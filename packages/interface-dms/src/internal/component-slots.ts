import { Logging } from "@antelopejs/interface-core/logging";
import type { ComponentSlotResolver, SlotOptions } from "../component-slots";

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
 *
 * @internal
 */
export const COMPONENT_SLOT_KEY = "slotId";

/** @internal */
export const slotResolvers = new Map<string, ComponentSlotResolver>();

function resolvableSlotIdOf(
  node: Parameters<ComponentSlotResolver>[0][string],
): string | undefined {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Serialized option trees contain primitives and arrays as well as slot-bearing objects.
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return undefined;
  }
  const slot: Partial<Pick<SlotOptions, typeof COMPONENT_SLOT_KEY>> = node;
  const slotId = slot[COMPONENT_SLOT_KEY];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- A serialized slot id must be a registered string; other option values remain ordinary data.
  if (typeof slotId !== "string" || !slotResolvers.has(slotId)) {
    return undefined;
  }
  return slotId;
}

function hasResolvableSlot(
  node: Parameters<ComponentSlotResolver>[0][string],
): boolean {
  if (Array.isArray(node)) {
    return node.some(hasResolvableSlot);
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Recursion stops at primitive leaves without parsing or changing consumer options.
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
async function resolveNode(
  node: Parameters<ComponentSlotResolver>[0][string],
): Promise<void> {
  if (Array.isArray(node)) {
    for (const item of node) await resolveNode(item);
    return;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only objects in the serialized options tree have children or mutable slot options.
  if (!node || typeof node !== "object") {
    return;
  }
  for (const value of Object.values(node)) await resolveNode(value);

  const slotId = resolvableSlotIdOf(node);
  const resolver = slotId ? slotResolvers.get(slotId) : undefined;
  if (!resolver) return;

  // SAFETY: node is a non-null object and SlotOptions imposes no value constraint on its keys.
  const target = node as SlotOptions;
  try {
    const resolved = await resolver(target);
    if (resolved === target) return;
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, resolved);
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
 *
 * @internal
 */
export async function ResolveComponentSlots<T>(options: T): Promise<T> {
  if (!hasResolvableSlot(options)) {
    return options;
  }
  const cloned = structuredClone(options);
  await resolveNode(cloned);
  return cloned;
}
