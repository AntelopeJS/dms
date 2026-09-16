import { randomUUID } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import {
  TenantLifecycle,
  tenantLifecycleTableName,
} from "../tables/tenantLifecycle.table";

const LIFECYCLE_ID = "membership-and-invites";

/** Admissions never expire; deletion cannot overtake a suspended producer. */
export class TenantLifecycleModel extends BasicDataModel(
  TenantLifecycle,
  tenantLifecycleTableName,
) {
  /** Initializes once; an existing closed row is never replaced or reopened. */
  async state(tenantId: string): Promise<TenantLifecycle> {
    const id = `${LIFECYCLE_ID}:${tenantId}`;
    const existing = (await this.get(id)) ?? (await this.get(LIFECYCLE_ID));
    if (existing) return existing;
    let failure: unknown;
    try {
      await this.insert({
        _id: id,
        revision: randomUUID(),
        closed: false,
        activeAttemptIds: [],
      });
    } catch (error) {
      failure = error;
    }
    const current = await this.get(id);
    if (!current)
      throw (
        failure ?? new Error("Tenant lifecycle initialization indeterminate")
      );
    return current;
  }

  private async transition(
    state: TenantLifecycle,
    patch: Partial<TenantLifecycle>,
  ): Promise<boolean> {
    const outcome = await this.table
      .atomicMutation(state._id, {
        type: "update",
        revisionField: "revision",
        expectedRevision: state.revision,
        nextRevision: randomUUID(),
        patch,
      })
      .run();
    if (outcome === "unknown")
      throw new Error("Tenant lifecycle transition indeterminate");
    return outcome === "applied";
  }

  /** Only a confirmed admission permits effects; unknown outcomes fail closed. */
  async admit(tenantId: string, attemptId: string): Promise<void> {
    while (true) {
      const state = await this.state(tenantId);
      if (state.closed) throw new Error("Tenant lifecycle admission is closed");
      if (
        await this.transition(state, {
          activeAttemptIds: [...state.activeAttemptIds, attemptId],
        })
      )
        return;
    }
  }

  /** Called only by the invocation that has finished every awaited producer effect. */
  async finish(tenantId: string, attemptId: string): Promise<void> {
    while (true) {
      const state = await this.state(tenantId);
      if (!state.activeAttemptIds.includes(attemptId)) return;
      const activeAttemptIds = state.activeAttemptIds.filter(
        (id) => id !== attemptId,
      );
      if (await this.transition(state, { activeAttemptIds })) return;
    }
  }

  /** Closes permanently before testing quiescence; active or uncertain work blocks deletion. */
  async close(tenantId: string): Promise<void> {
    while (true) {
      const state = await this.state(tenantId);
      if (!state.closed) {
        if (!(await this.transition(state, { closed: true }))) continue;
      }
      const current = await this.state(tenantId);
      if (!current.closed || current.activeAttemptIds.length) {
        throw new Error(
          "Tenant lifecycle deletion blocked by active or indeterminate attempts",
        );
      }
      return;
    }
  }
}
