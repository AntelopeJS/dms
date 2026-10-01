import {
  GetResponsibleModule,
  RunWithResponsibleModule,
} from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import type { InviteExtensionPayloads } from "./invite-extensions/types";
import type {
  TenantDataExportContribution,
  TenantExportArchive,
} from "./tenant-export";
import { OwnedRegistry } from "./utils/owned-registry";

export * from "./tenant-export";

// A hook may be synchronous or asynchronous; `any` already covers both, and
// `Promise<any> | any` collapsed to exactly the same type.
export type HookCallback = (...args: any[]) => any;

export enum Hook {
  /**
   * The database schemas are registered and the DMS is about to serve.
   *
   * It behaves like an already-resolved promise: the DMS fires it once per
   * start, and a handler registered after that — by a module loaded or
   * reloaded while the DMS runs — runs at once, in the background. It fires
   * again on every DMS start, and a reloaded module registers again, so a
   * handler may run several times over the life of a process and must be
   * safe to replay against a live database.
   */
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
  /**
   * A user deleted their own account. Fired once the DMS has removed what it
   * keeps about them (memberships, sessions, notifications, sign-in links and
   * the user row); a module keeping per-user rows of its own deletes them
   * here. A failing handler is logged and does not bring the account back.
   */
  USER_DELETED = "user:deleted",
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

export interface UserDeletedHookPayload {
  userId: string;
  email: string;
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
  [Hook.USER_DELETED]: {
    args: [payload: UserDeletedHookPayload];
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
  /**
   * Overrides the module id auto-detected from the registering call site. It
   * only names the handler: the registration is released with the module
   * generation that made it either way.
   */
  moduleId?: string;
}

export interface RegisteredHook<H extends Hook> {
  /** Owning module, undefined when it could not be resolved. */
  moduleId?: string;
  handler: HookHandler<H>;
}

/**
 * Hooks whose firing is a state rather than an event: once settled with
 * {@link SettleHook}, a handler registered afterwards runs at once.
 */
export type StickyHook = Hook.DATABASE_INITIALIZED;

interface HookEntry {
  callback: HookCallback;
  moduleId?: string;
}

interface SettledHook {
  name: Hook;
  args: unknown[];
}

const hooksRegistry = new Map<Hook, OwnedRegistry<HookEntry>>();

// Owned by the module generation that settles a hook, so a destroyed DMS
// takes the settled state down with it even when `stop()` never ran.
const settledHooks = new OwnedRegistry<SettledHook>();

function getHooks(name: Hook): OwnedRegistry<HookEntry> {
  const existing = hooksRegistry.get(name);
  if (existing) return existing;
  const hooks = new OwnedRegistry<HookEntry>();
  hooksRegistry.set(name, hooks);
  return hooks;
}

function logHookFailure(name: Hook, error: unknown): void {
  Logging.Error(`Hook '${name}' execution failed:`, error);
}

function findSettledHook(name: Hook): SettledHook | undefined {
  return settledHooks.values().find((settled) => settled.name === name);
}

/**
 * Runs a handler registered after its hook settled, without blocking the
 * registration: the registering module's `construct()` or `start()` neither
 * waits for it nor sees its failure.
 */
function runLateHandler(
  settled: SettledHook,
  callback: HookCallback,
  owner: string | undefined,
): void {
  const run = async (): Promise<unknown> => callback(...settled.args);
  const runAsOwner = async (): Promise<unknown> =>
    owner ? RunWithResponsibleModule(owner, run) : run();
  void Promise.resolve()
    .then(runAsOwner)
    .catch((error: unknown) => {
      Logging.Error(
        `Hook '${settled.name}' handler of module '${owner ?? "unknown"}' failed:`,
        error,
      );
    });
}

/**
 * Run `callback` whenever `name` fires.
 *
 * The handler belongs to the module generation that registers it and is
 * released when that generation is destroyed: a module reloaded in development
 * registers again from its next generation, and its previous handler is gone
 * rather than running beside the new one. Nothing has to be unregistered on
 * the way out.
 *
 * A handler for a {@link StickyHook} that has already settled also runs at
 * once, in the background; a failure is logged, never thrown here.
 */
export function RegisterHook<H extends Hook>(
  name: H,
  callback: HookHandler<H>,
  options?: HookRegistrationOptions,
): void {
  const owner = GetResponsibleModule();
  getHooks(name).add({
    callback: callback as HookCallback,
    moduleId: options?.moduleId ?? owner,
  });
  const settled = findSettledHook(name);
  if (settled) runLateHandler(settled, callback as HookCallback, owner);
}

/**
 * Drop a handler registered with {@link RegisterHook}, for a module that stops
 * listening while it stays loaded.
 */
export function UnregisterHook<H extends Hook>(
  name: H,
  callback: HookHandler<H>,
): void {
  getHooks(name).remove((entry) => entry.callback === callback);
}

/**
 * Exposes the registered handlers along with their owning module, for callers
 * that must invoke each handler with its own arguments — the tenant export
 * archive hands every contributor a differently namespaced archive.
 */
export function GetRegisteredHooks<H extends Hook>(
  name: H,
): RegisteredHook<H>[] {
  return getHooks(name)
    .values()
    .map((entry) => ({
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
  for (const hook of getHooks(name).values()) {
    await hook.callback(...args);
  }
}

/**
 * Fire a {@link StickyHook} and keep it settled: the handlers registered by
 * then run in series, as {@link ExecuteHooks} runs them, along with any
 * registered while they run, and every handler registered afterwards runs at
 * once until {@link UnsettleHook}. A failure propagates and leaves the hook
 * unsettled.
 *
 * The settled state belongs to the calling module generation and goes with it.
 */
export async function SettleHook<H extends StickyHook>(
  name: H,
  ...args: HookSignatures[H]["args"]
): Promise<void> {
  const ran = new Set<HookEntry>();
  let pending = getHooks(name).values();
  while (pending.length > 0) {
    for (const hook of pending) {
      ran.add(hook);
      await hook.callback(...args);
    }
    pending = getHooks(name)
      .values()
      .filter((hook) => !ran.has(hook));
  }
  settledHooks.add({ name, args });
}

/**
 * End what {@link SettleHook} started: later registrations wait for the hook
 * to be settled again.
 */
export function UnsettleHook(name: StickyHook): void {
  const isSettled = (settled: SettledHook) => settled.name === name;
  while (settledHooks.has(isSettled)) settledHooks.remove(isSettled);
}

export async function CollectHooks<H extends Hook>(
  name: H,
  ...args: HookSignatures[H]["args"]
): Promise<HookSignatures[H]["result"][]> {
  const results: HookSignatures[H]["result"][] = [];
  for (const hook of getHooks(name).values()) {
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
