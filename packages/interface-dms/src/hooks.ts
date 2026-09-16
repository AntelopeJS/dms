import { GetResponsibleModule } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import type { InviteExtensionPayloads } from "./invite-extensions/types";
import type {
  TenantDataExportContribution,
  TenantExportArchive,
} from "./tenant-export";

export * from "./tenant-export";

// A hook may be synchronous or asynchronous; `any` already covers both, and
// `Promise<any> | any` collapsed to exactly the same type.
export type HookCallback = (...args: any[]) => any;

export enum Hook {
  DATABASE_INITIALIZED = "database:initialized",
  /**
   * A workspace is being provisioned, and nothing of it is final yet.
   *
   * Handlers run in series, each awaited before the next, and one that throws
   * propagates to whoever is provisioning: that emitter must then unwind the
   * workspace it was creating. That direction is the guarantee, and the reason
   * to fire before the commit rather than after it — a workspace never ends up
   * provisioned while the enrichment a consumer needed failed to be written.
   *
   * The other direction is not guaranteed and cannot be: there is no shared
   * transaction to enlist in. A handler that already returned has committed
   * its own rows, and neither a later handler throwing nor the emitter failing
   * afterwards takes them back. Key that write on `tenantId` so it can be
   * cleaned up along with the workspace, and make it idempotent so a retried
   * signup does not double it.
   *
   * No DMS code fires this hook. Provisioning belongs to the signup flow of a
   * SaaS module, and the contract above is what such an emitter owes its
   * subscribers.
   */
  TENANT_BEING_PROVISIONED = "tenant:being-provisioned",
  TENANT_DELETED = "tenant:deleted",
  TENANT_DATA_EXPORT = "tenant:data-export",
  INVITE_BEING_CREATED = "invite:being-created",
  INVITE_CREATED = "invite:created",
  INVITE_DELETED = "invite:deleted",
  MEMBER_BEING_ADDED = "member:being-added",
  MEMBER_ADDED = "member:added",
  MEMBER_REMOVED = "member:removed",
  USER_REGISTERED = "user:registered",
}

/**
 * The workspace being provisioned, and whatever the caller of the provisioning
 * flow asked to carry along with it.
 */
export interface TenantProvisioningHookPayload {
  tenantId: string;
  /** Account the workspace is being provisioned for. */
  userId: string;
  /**
   * Data the caller of the provisioning flow attached to the request — an
   * acquisition source, a team size, a referral code, whatever that product
   * collects at signup.
   *
   * It is opaque on purpose. The DMS never reads a key of it, never validates
   * it and never stores it: it carries the object to the handlers, and a
   * handler writes what it recognises into its own tables. The shape is a
   * contract between the caller and the handler, one the DMS is deliberately
   * not a party to — which is what lets a consumer collect new fields without
   * a DMS release.
   */
  extras: Record<string, unknown>;
}

export interface InviteHookPayload {
  tenantId: string;
  email: string;
  asTenantOwner: boolean;
  roleIds: string[];
  /** Stable replacement decision identity; creation hooks may replay. */
  deliveryId?: string;
}

export interface InviteCreatedHookPayload extends InviteHookPayload {
  inviteId: string;
  token: string;
}

/**
 * Why an invitation row went away. Two of them delete a row without the
 * invitation ending: `accepted` means the invitee joined and it was consumed,
 * `resent` that the same invitation was reissued under a fresh token. Only
 * `cancelled` and `replaced` retire what the invitation stood for.
 */
export type InviteDeletedReason =
  | "accepted"
  | "cancelled"
  | "replaced"
  | "expired"
  | "resent";

/** Reasons under which creating an invitation displaces an existing one. */
export type InviteReplacementReason = Extract<
  InviteDeletedReason,
  "replaced" | "resent"
>;

export interface InviteDeletedHookPayload {
  tenantId: string;
  inviteId: string;
  email: string;
  reason: InviteDeletedReason;
  /** Stable terminal decision identity. Handlers must tolerate concurrent replay. */
  deliveryId?: string;
  /** Payloads the invitation carried, for handlers that must undo their work. */
  extensions?: InviteExtensionPayloads | null;
}

export interface MemberHookPayload {
  tenantId: string;
  userId: string;
  isTenantOwner: boolean;
  /** Stable invite delivery identity when membership originates from a durable acceptance. */
  deliveryId?: string;
}

/** Tenant deletion hooks can repeat; deduplicate non-idempotent effects by operationId. */
export interface TenantDeletionContext {
  operationId: string;
}

export interface MemberRemovedHookPayload {
  tenantId: string;
  userIds: string[];
}

export interface UserRegisteredHookPayload {
  tenantId: string;
  userId: string;
  email: string;
  name: string;
}

export interface HookSignatures {
  [Hook.DATABASE_INITIALIZED]: {
    args: [];
    result: undefined;
  };
  [Hook.TENANT_BEING_PROVISIONED]: {
    args: [payload: TenantProvisioningHookPayload];
    result: undefined;
  };
  [Hook.TENANT_DELETED]: {
    args: [tenantId: string, context?: TenantDeletionContext];
    result: undefined;
  };
  [Hook.TENANT_DATA_EXPORT]: {
    args: [tenantId: string, archive: TenantExportArchive, signal: AbortSignal];
    // `void` rather than `undefined`, which would reject a handler that only
    // writes to the archive.
    result: TenantDataExportContribution | void;
  };
  [Hook.INVITE_BEING_CREATED]: {
    args: [payload: InviteHookPayload];
    result: undefined;
  };
  [Hook.INVITE_CREATED]: {
    args: [payload: InviteCreatedHookPayload];
    result: undefined;
  };
  [Hook.INVITE_DELETED]: {
    args: [payload: InviteDeletedHookPayload];
    result: undefined;
  };
  [Hook.MEMBER_BEING_ADDED]: {
    args: [payload: MemberHookPayload];
    result: undefined;
  };
  [Hook.MEMBER_ADDED]: {
    args: [payload: MemberHookPayload];
    result: undefined;
  };
  [Hook.MEMBER_REMOVED]: {
    args: [payload: MemberRemovedHookPayload];
    result: undefined;
  };
  [Hook.USER_REGISTERED]: {
    args: [payload: UserRegisteredHookPayload];
    result: undefined;
  };
}

export type HookHandler<H extends Hook> = (
  ...args: HookSignatures[H]["args"]
) => Promise<HookSignatures[H]["result"]> | HookSignatures[H]["result"];

export interface HookRegistrationOptions {
  /** Overrides the module id auto-detected from the registering call site. */
  moduleId?: string;
}

export interface RegisteredHook<H extends Hook> {
  /** Owning module, undefined when it could not be resolved. */
  moduleId?: string;
  handler: HookHandler<H>;
}

interface HookEntry {
  callback: HookCallback;
  moduleId?: string;
}

const hooksRegistry = new Map<Hook, HookEntry[]>();

function getHooks(name: Hook): HookEntry[] {
  if (!hooksRegistry.has(name)) {
    hooksRegistry.set(name, []);
  }
  return hooksRegistry.get(name) ?? [];
}

function logHookFailure(name: Hook, error: unknown): void {
  Logging.Error(`Hook '${name}' execution failed:`, error);
}

export function RegisterHook<H extends Hook>(
  name: H,
  callback: HookHandler<H>,
  options?: HookRegistrationOptions,
): void {
  getHooks(name).push({
    callback: callback as HookCallback,
    moduleId: options?.moduleId ?? GetResponsibleModule(),
  });
}

export function UnregisterHook<H extends Hook>(
  name: H,
  callback: HookHandler<H>,
): void {
  const hooks = getHooks(name);
  const index = hooks.findIndex((entry) => entry.callback === callback);
  if (index !== -1) {
    hooks.splice(index, 1);
  }
}

/**
 * Exposes the registered handlers along with their owning module, for callers
 * that must invoke each handler with its own arguments — the tenant export
 * archive hands every contributor a differently namespaced archive.
 */
export function GetRegisteredHooks<H extends Hook>(
  name: H,
): RegisteredHook<H>[] {
  return getHooks(name).map((entry) => ({
    moduleId: entry.moduleId,
    handler: entry.callback as HookHandler<H>,
  }));
}

/**
 * Registers a tenant data export contributor with an explicit module id, used
 * to namespace its archive entries. Prefer it over a bare `RegisterHook` when
 * the contributor writes to the archive: the id then no longer depends on the
 * call site the runtime attributes the registration to.
 */
export function RegisterTenantDataExportContributor(
  moduleId: string,
  handler: HookHandler<Hook.TENANT_DATA_EXPORT>,
): void {
  RegisterHook(Hook.TENANT_DATA_EXPORT, handler, { moduleId });
}

export async function ExecuteHooks<H extends Hook>(
  name: H,
  ...args: HookSignatures[H]["args"]
): Promise<void> {
  const hooks = getHooks(name);
  for (const hook of hooks) {
    await hook.callback(...args);
  }
}

export async function CollectHooks<H extends Hook>(
  name: H,
  ...args: HookSignatures[H]["args"]
): Promise<HookSignatures[H]["result"][]> {
  const hooks = getHooks(name);
  const results: HookSignatures[H]["result"][] = [];
  for (const hook of hooks) {
    try {
      const value = (await hook.callback(
        ...args,
      )) as HookSignatures[H]["result"];
      results.push(value);
    } catch (error) {
      logHookFailure(name, error);
    }
  }
  return results;
}
