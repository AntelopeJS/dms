import { RegisteringProxy } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { INVITE_EXTENSION_FIELD_SEPARATOR } from "./field-ids";
import type {
  InviteExtensionInfo,
  InviteExtensionOptions,
  InviteFieldContribution,
  ResolvedInvitePlacement,
} from "./types";

/**
 * A registration plus the contribution it serializes to. The contribution is
 * built once, lazily, and cached on the entry: serializing runs the form's
 * option transforms — which is where its upload fields claim their tokens —
 * and those must not be re-signed on every layout request.
 */
export interface InviteExtensionEntry {
  info: InviteExtensionInfo;
  contribution?: Promise<InviteFieldContribution | undefined>;
}

const inviteExtensions = new Map<string, InviteExtensionEntry>();

export function listInviteExtensionEntries(): InviteExtensionEntry[] {
  return [...inviteExtensions.values()];
}

export function listInviteExtensions(): InviteExtensionInfo[] {
  return listInviteExtensionEntries().map((entry) => entry.info);
}

export function getInviteExtension(
  key: string,
): InviteExtensionInfo | undefined {
  return inviteExtensions.get(key)?.info;
}

const DEFAULT_PLACEMENT: ResolvedInvitePlacement = { side: "end", order: 0 };

function resolvePlacement(
  options: InviteExtensionOptions<never>["placement"],
): ResolvedInvitePlacement {
  if (!options) return DEFAULT_PLACEMENT;
  // `anchorField` is set only when the placement names one: its absence is
  // what the assembler reads as "append at the end".
  const placement: ResolvedInvitePlacement = {
    side: options.side ?? DEFAULT_PLACEMENT.side,
    order: options.order ?? DEFAULT_PLACEMENT.order,
  };
  if (options.anchorField) placement.anchorField = options.anchorField;
  return placement;
}

function assertUsableKey(key: string): void {
  if (!key.trim()) {
    throw new Error("An invite extension must declare a non-empty key.");
  }
  if (key.includes(INVITE_EXTENSION_FIELD_SEPARATOR)) {
    throw new Error(
      `Invite extension key "${key}" may not contain "${INVITE_EXTENSION_FIELD_SEPARATOR}": it separates the key from the field id in the merged invite form.`,
    );
  }
}

/**
 * Attach module data to member invitations: the fields of `component` are
 * merged into the DMS invite modal, the values the admin fills are validated
 * against `schema` and stored on the invitation, and `onAccept` receives them
 * once the invitee is a member of the tenant.
 *
 * Placement follows `@RegisterPageExtension`: `anchorField` names a field of
 * the invite form to sit before or after, `order` breaks ties between
 * extensions landing at the same spot, and equal orders fall back to the
 * extension key — so the modal assembles the same way on every host and
 * across restarts, never depending on module start order.
 *
 * Field ids are namespaced by `key`, so two extensions may both contribute a
 * `plan` field; `schema` and `onAccept` see them unprefixed.
 *
 * An invitee who already has an account is added to the tenant on the spot and
 * no invitation row is written: `onAccept` still runs, with `inviteId` unset.
 * `onCleanup` runs when the invitation is cancelled or replaced and when a
 * member is removed — never on acceptance, which also deletes the invitation.
 *
 * The registration is bound to the registering module and lifted when it
 * stops, so the fields leave the modal with it.
 *
 * ```ts
 * RegisterInviteExtension({
 *   key: "billing",
 *   component: Form({ fields: [{ id: "costCenter", type: new StringType() }] }),
 *   schema: z.object({ costCenter: z.string().min(1) }),
 *   onAccept: (payload, member) => assignCostCenter(member, payload.costCenter),
 * });
 * ```
 *
 * @returns Removes this extension, for a module that drops it while staying
 * loaded.
 */
export function RegisterInviteExtension<T>(
  options: InviteExtensionOptions<T>,
): () => void {
  assertUsableKey(options.key);

  const info: InviteExtensionInfo = {
    key: options.key,
    component: options.component,
    // The source and the target do not overlap, so this cannot be one
    // assertion: the value reaches here through a decorator, a JWT
    // payload or a filter tuple, none of which the type system sees.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions
    schema: options.schema as unknown as InviteExtensionInfo["schema"],
    onAccept: options.onAccept as InviteExtensionInfo["onAccept"],
    onCleanup: options.onCleanup as InviteExtensionInfo["onCleanup"],
    label: options.label,
    description: options.description,
    placement: resolvePlacement(options.placement),
  };

  internal.RegisterInviteExtension.register(info);
  return () => internal.RegisterInviteExtension.unregister(info);
}

/**
 * @internal
 */
export namespace internal {
  export const RegisterInviteExtension = new RegisteringProxy<
    (info: InviteExtensionInfo) => void
  >();

  /**
   * The last registration wins, rather than a key collision being fatal: a hot
   * reload registers the replacement before the old one unregisters, so the
   * common case of a key already being held is a module reclaiming its own.
   * Throwing there would fail the reloaded module's construction and — once
   * the departing one unregisters — leave the invite modal without the fields
   * until a full restart.
   *
   * Two different modules on one key would overwrite each other's payload on
   * the invitation, which is a declaration error; it cannot be told apart from
   * a reload, so it is reported rather than raised.
   */
  export function applyInviteExtension(info: InviteExtensionInfo): void {
    const existing = inviteExtensions.get(info.key);
    if (existing && existing.info !== info) {
      Logging.Warn(
        `[dms] invite extension key "${info.key}" was already registered; the latest registration now owns it. If two modules claim this key, one of them silently loses its payload — give them distinct keys.`,
      );
    }
    inviteExtensions.set(info.key, { info });
  }

  export function revokeInviteExtension(info: InviteExtensionInfo): void {
    const existing = inviteExtensions.get(info.key);
    // A hot reload registers the replacement before the old one unregisters,
    // so an unconditional delete would drop the live registration.
    if (!existing || existing.info !== info) return;
    inviteExtensions.delete(info.key);
  }

  /** Test seam: drops every registration without going through the proxy. */
  export function clearInviteExtensions(): void {
    inviteExtensions.clear();
  }
}

export function logInviteExtensionFailure(
  key: string,
  action: string,
  error: unknown,
): void {
  Logging.Error(`[dms] invite extension "${key}" failed to ${action}:`, error);
}
