import {
  GetResponsibleModule,
  RegisteringProxy,
} from "@antelopejs/interface-core";
import { INVITE_EXTENSION_FIELD_SEPARATOR } from "./internal/field-ids";
import type {
  InviteExtensionInfo,
  ResolvedInvitePlacement,
} from "./internal/types";
import type { InviteExtensionOptions } from "./types";

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
 * The fields also appear in the edit form of a pending invitation, prefilled
 * with the stored payload: an admin can change it until the invitee accepts,
 * unless `editable` is `false`, and `onUpdate` hears about each change.
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
    editable: options.editable,
    onUpdate: options.onUpdate as InviteExtensionInfo["onUpdate"],
    label: options.label,
    description: options.description,
    placement: resolvePlacement(options.placement),
    // The core answers an empty string when it resolves no module, which
    // must not read as one module shared by every unresolved registration.
    moduleId: GetResponsibleModule() || undefined,
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
}
