import { ExecuteHooks, Hook, type MemberChange } from "./hooks";
import { runTenantLifecycleOperation } from "./tenant-lifecycle";

/** What one membership or invitation write changes, and the write itself. */
export interface TenantMembersWrite<T> {
  /**
   * Announced through `Hook.MEMBER_BEING_CHANGED`, in order, before `write`
   * runs. Empty for a write that changes no membership, such as an invitation
   * created, edited or retired.
   */
  changes: MemberChange[];
  write: () => Promise<T>;
}

/**
 * The one entry point for writing tenant members and invitations: every
 * insert, update or delete of a `TenantMemberModel` or `UserInviteModel` row
 * goes through it. It admits the write under the tenant's lifecycle (refused
 * while a barrier is held or once the tenant is closed), calls `plan` to read
 * the current state and describe the change, fires `Hook.MEMBER_BEING_CHANGED`
 * for each change (a throwing handler refuses the write, replays included),
 * then runs the write and releases the admission.
 *
 * `plan` runs inside the admission so the change it describes is read from
 * state no paused initiator is validating. Never call this from inside
 * another `changeTenantMembers` or `runTenantLifecycleOperation` callback:
 * each call takes its own admission.
 */
export async function changeTenantMembers<T>(
  tenantId: string,
  plan: () => Promise<TenantMembersWrite<T>>,
): Promise<T> {
  return runTenantLifecycleOperation(tenantId, async () => {
    const { changes, write } = await plan();
    for (const change of changes) {
      await ExecuteHooks(Hook.MEMBER_BEING_CHANGED, { tenantId, ...change });
    }
    return write();
  });
}
