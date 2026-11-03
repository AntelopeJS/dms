import { Logging } from "@antelopejs/interface-core/logging";
import type { MaybePromise } from "../types";
import type { WatchAction } from "../watch-actions";

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

/**
 * The component name `Form` serializes under. A copy: the form's own module
 * sits above this one in the layering, and the walker tests resolve forms built
 * by `Form`, so the two cannot drift apart.
 */
const SLOT_FORM_COMPONENT_NAME = "dms-form";

/**
 * What the walker checks of a form's options before it hands them to a
 * resolver: a `fields` array and, on the node it resolves, a registered slot
 * id. `SlotOptions` is the full contract a resolver sees.
 */
interface SlotFormInput {
  slotId?: string;
  fields: unknown[];
}

/** What a resolver answers: a form's options, with its watch actions. */
interface SlotFormOptions extends SlotFormInput {
  watchActions?: WatchAction[];
}

/** @internal */
export type SlotFormResolver = (
  options: SlotFormInput,
) => MaybePromise<SlotFormOptions>;

/** @internal */
export const slotResolvers = new Map<string, SlotFormResolver>();

type SlotFormTarget = SlotFormInput & { slotId: string };

function isSlotFormOptions(options: unknown): options is SlotFormTarget {
  if (typeof options !== "object" || options === null) return false;
  if (!("fields" in options) || !Array.isArray(options.fields)) return false;
  return (
    COMPONENT_SLOT_KEY in options &&
    typeof options[COMPONENT_SLOT_KEY] === "string" &&
    slotResolvers.has(options[COMPONENT_SLOT_KEY])
  );
}

/**
 * The options of a serialized form that opens a slot someone owns. Only a
 * form declares `slotId`, and it always serializes a `fields` array, so a node
 * that is anything else is left alone, whatever its options say.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Takes one node of the serialized options tree ResolveComponentSlots walks over a page's cached layout, any primitive, array or object, and narrows it with Array.isArray and typeof before reading it.
function slotFormOptionsOf(node: unknown): SlotFormTarget | undefined {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Serialized option trees contain primitives and arrays as well as slot-bearing objects.
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return undefined;
  }
  if (
    !("componentName" in node) ||
    node.componentName !== SLOT_FORM_COMPONENT_NAME
  ) {
    return undefined;
  }
  const options = "options" in node ? node.options : undefined;
  return isSlotFormOptions(options) ? options : undefined;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Takes one node of the serialized options tree ResolveComponentSlots walks over a page's cached layout, any primitive, array or object, and narrows it with Array.isArray and typeof before reading it.
function hasResolvableSlot(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(hasResolvableSlot);
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Recursion stops at primitive leaves without parsing or changing consumer options.
  if (!node || typeof node !== "object") {
    return false;
  }
  if (slotFormOptionsOf(node)) {
    return true;
  }
  return Object.values(node).some(hasResolvableSlot);
}

/**
 * Children first, so a slot nested inside another one still resolves — and so
 * what a resolver contributes is never walked again, which would let a
 * contribution declaring the slot it was contributed to loop forever.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Takes one node of the serialized options tree ResolveComponentSlots walks over a page's cached layout, any primitive, array or object, and narrows it with Array.isArray and typeof before reading it.
async function resolveNode(node: unknown): Promise<void> {
  if (Array.isArray(node)) {
    for (const item of node) await resolveNode(item);
    return;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only objects in the serialized options tree have children or mutable slot options.
  if (!node || typeof node !== "object") {
    return;
  }
  for (const value of Object.values(node)) await resolveNode(value);

  const target = slotFormOptionsOf(node);
  if (!target) return;
  const { slotId } = target;
  const resolver = slotResolvers.get(slotId);
  if (!resolver) return;

  try {
    const resolved = await resolver(target);
    if (resolved === target) return;
    for (const key of Object.keys(target)) Reflect.deleteProperty(target, key);
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
