import { randomUUID } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import {
  TenantLifecycle,
  tenantLifecycleTableName,
} from "./tenantLifecycle.table";

const LIFECYCLE_ID = "membership-and-invites";

/**
 * Admissions never expire; deletion cannot overtake a suspended producer.
 *
 * @internal
 */
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
      if (state.barrierId)
        throw new Error("Tenant lifecycle admission is paused");
      if (
        await this.transition(state, {
          activeAttemptIds: [...state.activeAttemptIds, attemptId],
        })
      )
        return;
    }
  }

  /** One CAS only: a delayed caller must not acquire against a newer revision. */
  async pause(
    tenantId: string,
    barrierId: string,
    expectedRevision: string,
  ): Promise<boolean> {
    if (!barrierId)
      throw new Error("Tenant lifecycle barrier requires an identity");
    const state = await this.state(tenantId);
    if (state.closed || state.barrierId || state.revision !== expectedRevision)
      return false;
    return this.transition(state, { barrierId });
  }

  /** Also revokes an in-flight acquisition when no barrier has landed yet. */
  async resume(tenantId: string, barrierId: string): Promise<boolean> {
    if (!barrierId)
      throw new Error("Tenant lifecycle barrier requires an identity");
    while (true) {
      const state = await this.state(tenantId);
      if (state.closed || (state.barrierId && state.barrierId !== barrierId))
        return false;
      if (await this.transition(state, { barrierId: null })) return true;
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
