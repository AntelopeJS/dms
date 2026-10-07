import { Logging } from "@antelopejs/interface-core/logging";
import type { InviteExtensionInfo, InviteFieldContribution } from "./types";

/**
 * A registration plus the contribution it serializes to. The contribution is
 * built once, lazily, and cached on the entry: serializing runs the form's
 * option transforms — which is where its upload fields claim their tokens —
 * and those must not be re-signed on every layout request.
 *
 * @internal
 */
export interface InviteExtensionEntry {
  info: InviteExtensionInfo;
  contribution?: Promise<InviteFieldContribution | undefined>;
}

/** @internal */
export const inviteExtensions = new Map<string, InviteExtensionEntry>();

/** @internal */
export function listInviteExtensionEntries(): InviteExtensionEntry[] {
  return [...inviteExtensions.values()];
}

/** @internal */
export function listInviteExtensions(): InviteExtensionInfo[] {
  return listInviteExtensionEntries().map((entry) => entry.info);
}

/** @internal */
export function getInviteExtension(
  key: string,
): InviteExtensionInfo | undefined {
  return inviteExtensions.get(key)?.info;
}

/** @internal */
export function logInviteExtensionFailure(
  key: string,
  action: string,
  error: unknown,
): void {
  Logging.Error(`[dms] invite extension "${key}" failed to ${action}:`, error);
}

// An unresolved module matches nothing: two registrations whose owner is
// unknown are not known to be the same module, so they still warn.
function isSameRegisteringModule(
  held: InviteExtensionInfo,
  incoming: InviteExtensionInfo,
): boolean {
  if (held === incoming) return true;
  return held.moduleId !== undefined && held.moduleId === incoming.moduleId;
}

/**
 * The last registration wins, rather than a key collision being fatal: a hot
 * reload registers the replacement before the old one unregisters, so the
 * common case of a key already being held is a module reclaiming its own.
 * Throwing there would fail the reloaded module's construction and — once
 * the departing one unregisters — leave the invite modal without the fields
 * until a full restart.
 *
 * The holder is told apart by the module that registered it, not by the
 * object: a reload re-registers a new one, and a DMS reload is replayed a
 * fresh view of the same one. Two different modules on one key would
 * overwrite each other's payload on the invitation, which is a declaration
 * error; it is reported rather than raised, for the reason above.
 *
 * @internal
 */
export function applyInviteExtension(info: InviteExtensionInfo): void {
  const existing = inviteExtensions.get(info.key);
  if (existing && !isSameRegisteringModule(existing.info, info)) {
    Logging.Warn(
      `[dms] invite extension key "${info.key}" was already registered by another module; the latest registration now owns it. If two modules claim this key, one of them silently loses its payload — give them distinct keys.`,
    );
  }
  inviteExtensions.set(info.key, { info });
}

/** @internal */
export function revokeInviteExtension(info: InviteExtensionInfo): void {
  const existing = inviteExtensions.get(info.key);
  // A hot reload registers the replacement before the old one unregisters,
  // so an unconditional delete would drop the live registration.
  if (!existing || existing.info !== info) return;
  inviteExtensions.delete(info.key);
}

/**
 * Test seam: drops every registration without going through the proxy.
 *
 * @internal
 */
export function clearInviteExtensions(): void {
  inviteExtensions.clear();
}
