import { createHash, randomUUID } from "node:crypto";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import type { UserInvite } from "../tables/user_invites.table";
import {
  type InviteMembershipPhase,
  InviteResolution,
  type InviteResolutionReason,
  inviteResolutionsTableName,
} from "../tables/inviteResolutions.table";

export interface InviteDecision {
  tenantId: string;
  invite: UserInvite;
  reason: InviteResolutionReason;
  userId?: string;
  replacement?: UserInvite;
  extensionKeys: string[];
}

function decisionId(tenantId: string, inviteId: string): string {
  return createHash("sha256")
    .update(JSON.stringify([tenantId, inviteId]))
    .digest("hex");
}

/** Arbitrates terminal invite outcomes using an insert-only primary key, never a lease. */
export class InviteResolutionsModel extends BasicDataModel(
  InviteResolution,
  inviteResolutionsTableName,
) {
  /** Finds a retained decision after the original invite has been retired. */
  async getForInvite(
    tenantId: string,
    inviteId: string,
  ): Promise<InviteResolution | undefined> {
    return this.get(decisionId(tenantId, inviteId));
  }

  /** Reads the canonical decision even after a lost insert acknowledgement. */
  async decide(input: InviteDecision): Promise<InviteResolution> {
    const { tenantId, invite, reason, userId, replacement, extensionKeys } =
      input;
    const id = decisionId(tenantId, invite._id);
    let insertError: unknown;
    try {
      await this.insert({
        tenantId,
        invite,
        reason,
        extensionKeys,
        _id: id,
        userId: userId ?? null,
        replacement: replacement
          ? Object.assign({}, replacement, { creationResolutionId: id })
          : null,
        revision: randomUUID(),
        membershipPhase: "pending",
        replacementPhase: "pending",
        completed: false,
        decidedAt: new Date(),
      });
    } catch (error) {
      insertError = error;
    }
    const resolution = await this.get(id);
    if (
      !resolution ||
      resolution.tenantId !== tenantId ||
      resolution.invite.token !== invite.token
    ) {
      throw insertError ?? new Error("Invite decision was not persisted");
    }
    return resolution;
  }

  /** Advances a membership stage only against the exact observed revision. */
  async advanceMembership(
    resolution: InviteResolution,
    membershipPhase: InviteMembershipPhase,
    field: "membershipPhase" | "replacementPhase" = "membershipPhase",
  ): Promise<boolean> {
    const nextRevision = randomUUID();
    const outcome = await this.table
      .atomicMutation(resolution._id, {
        type: "update",
        revisionField: "revision",
        expectedRevision: resolution.revision,
        nextRevision,
        patch: { [field]: membershipPhase },
      })
      .run();
    if (outcome === "applied") return true;
    if (outcome === "not-applied") return false;
    const current = await this.get(resolution._id);
    if (current?.revision === nextRevision) return true;
    throw new Error(
      "Invite membership transition acknowledgement is indeterminate",
    );
  }
}
