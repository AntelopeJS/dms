import type { FieldGroupSerialized, FormBuilder } from "../../base/form";
import type { WatchAction } from "../../base/types/watch";
import type { ZodType, ZodTypeDef } from "zod";
import type { PlacementSide } from "../../component";
import type {
  InviteAcceptHandler,
  InviteCleanupHandler,
  InviteUpdateHandler,
} from "../types";

/**
 * Resolved placement of a registered extension.
 *
 * @internal
 */
export interface ResolvedInvitePlacement {
  side: PlacementSide;
  anchorField?: string;
  order: number;
}

/** @internal */
export interface InviteDeliveryOptions {
  /** Retains durable work by propagating contributor failures after all callbacks run. */
  retryOnFailure?: boolean;
}

/**
 * A registration as the registry holds it: placement resolved, payload type
 * erased. The object itself is the handle — it is what the registering proxy
 * hands back to unregister when the extending module stops.
 *
 * @internal
 */
export interface InviteExtensionInfo {
  key: string;
  component: FormBuilder;
  schema: ZodType<unknown, ZodTypeDef, unknown>;
  onAccept: InviteAcceptHandler<unknown>;
  onCleanup?: InviteCleanupHandler<unknown>;
  /** Unset reads as `true`, as it does on the options. */
  editable?: boolean;
  onUpdate?: InviteUpdateHandler<unknown>;
  label?: string;
  description?: string;
  placement: ResolvedInvitePlacement;
  /** The module that registered the extension, undefined when unresolved. */
  moduleId?: string;
}

/**
 * One extension's contribution to the invite form, serialized once when it
 * registers: the block of fields, the JSON-schema entries the browser
 * validates them against, and the watches the contributed form declared —
 * all keyed by the prefixed field ids the merged form uses.
 *
 * @internal
 */
export interface InviteFieldContribution {
  key: string;
  side: PlacementSide;
  anchorField?: string;
  order: number;
  editable: boolean;
  group: FieldGroupSerialized;
  properties: Record<string, unknown>;
  requiredProperties: string[];
  watchActions: WatchAction[];
}
