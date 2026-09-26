import type { FieldGroupSerialized, FormBuilder } from "../base/form";
import type { WatchAction } from "../base/types/watch";
import type { ZodType, ZodTypeDef } from "zod";
import type { PlacementSide } from "../component";
import type { TenantMember } from "../db";
import type { MaybePromise } from "../types";

/**
 * Where an extension's fields sit among the invite form's own. `anchorField`
 * names a top-level field (or field group) id of the invite form; without one,
 * `before` puts the block above every own field and `after`/`end` below them.
 */
export interface InviteExtensionPlacement {
  side?: PlacementSide;
  anchorField?: string;
  /**
   * Breaks the tie when several extensions land at the same spot: lower first,
   * equal orders fall back to the extension key — never to module start order.
   */
  order?: number;
}

/** Resolved placement of a registered extension. */
export interface ResolvedInvitePlacement {
  side: PlacementSide;
  anchorField?: string;
  order: number;
}

/** The invitation an extension's payload is being delivered for. */
export interface InviteExtensionContext {
  tenantId: string;
  email: string;
  /** Stable durable delivery identity. Handlers must deduplicate effects when present. */
  deliveryId?: string;
  /**
   * Unset when the invitee already had an account: they are added to the
   * tenant straight away and no `user_invites` row is ever written.
   */
  inviteId?: string;
}

export type InviteCleanupReason = "invite-deleted" | "member-removed";

/** What went away, so a contributor knows which of its data to drop. */
export interface InviteCleanupContext {
  reason: InviteCleanupReason;
  tenantId: string;
  /** Stable durable delivery identity. Cleanup must tolerate concurrent retries. */
  deliveryId?: string;
  /** Set for `invite-deleted`. */
  inviteId?: string;
  email?: string;
  /** Set for `member-removed`. */
  userId?: string;
}

export type InviteAcceptHandler<T> = (
  payload: T,
  member: TenantMember,
  context: InviteExtensionContext,
) => MaybePromise<void>;

/**
 * Receives the payload an admin just saved on a pending invitation, parsed by
 * the extension's schema, and the one it replaced — `undefined` when the
 * invitation carried none or the schema no longer accepts it.
 */
export type InviteUpdateHandler<T> = (
  payload: T,
  previous: T | undefined,
  context: InviteExtensionContext,
) => MaybePromise<void>;

export type InviteCleanupHandler<T> = (
  payload: T | undefined,
  context: InviteCleanupContext,
) => MaybePromise<void>;

export interface InviteDeliveryOptions {
  /** Retains durable work by propagating contributor failures after all callbacks run. */
  retryOnFailure?: boolean;
}

export interface InviteExtensionOptions<T> {
  /**
   * Namespace of the extension, on the invite row and on the form fields it
   * contributes. May not contain `__`, which separates it from the field id.
   */
  key: string;
  /** Form whose fields are merged into the invite modal. */
  component: FormBuilder;
  /**
   * Validates the payload, at submit and again at delivery. Its keys are the
   * field ids of `component`, unprefixed.
   *
   * The input side is `unknown` because the schema is handed the raw slice of
   * the submission — which also lets it transform, `onAccept` receiving the
   * output.
   */
  schema: ZodType<T, ZodTypeDef, unknown>;
  /** Called after membership exists; durable deliveries can replay with the same deliveryId. */
  onAccept: InviteAcceptHandler<T>;
  /**
   * Called when the invitation is cancelled or replaced, and when a member is
   * removed from the tenant. Not called on acceptance. Durable expiry and
   * retirement can replay concurrently; deduplicate external effects by
   * context.deliveryId and scope resource deletion to context.inviteId.
   */
  onCleanup?: InviteCleanupHandler<T>;
  /**
   * Whether an admin may change the payload while the invitation is pending,
   * from its edit form. Defaults to `true`: the payload is only ever handed
   * over at acceptance, so an edit before then reads exactly as if the admin
   * had typed the new value when inviting. `false` shows the fields read-only
   * there.
   */
  editable?: boolean;
  /**
   * Called after an admin saved a changed payload on a pending invitation, for
   * an extension that derives something from it before acceptance. The edit is
   * already stored: a failure is logged, never raised.
   */
  onUpdate?: InviteUpdateHandler<T>;
  /** Heading of the contributed block. Defaults to the form's own title. */
  label?: string;
  description?: string;
  placement?: InviteExtensionPlacement;
}

/**
 * A registration as the registry holds it: placement resolved, payload type
 * erased. The object itself is the handle — it is what the registering proxy
 * hands back to unregister when the extending module stops.
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
}

/** Payloads stored on an invitation, keyed by extension key. */
export type InviteExtensionPayloads = Record<string, unknown>;

/**
 * One extension's contribution to the invite form, serialized once when it
 * registers: the block of fields, the JSON-schema entries the browser
 * validates them against, and the watches the contributed form declared —
 * all keyed by the prefixed field ids the merged form uses.
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
