import {
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "../../constants";
import type { UserInvite } from "./user_invites.table";
import type { InviteDeletedReason } from "../../hooks";
import { inviteResolutionsTableName } from "../internal/table-names";

export type InviteResolutionReason = InviteDeletedReason | "expired";
export type InviteMembershipPhase = "pending" | "applying" | "applied";

/** Immutable terminal decision and retry snapshot; completion only moves to true. */
@RegisterTable(inviteResolutionsTableName, TENANT_SCHEMA_NAME)
export class InviteResolution extends Table {
  @Field("string") declare _id: string;
  @Field("string") declare tenantId: string;
  @Field("string") declare reason: InviteResolutionReason;
  @Field("string") declare userId: string | null;
  @Field("any") declare invite: UserInvite;
  @Field("any") declare replacement: UserInvite | null;
  @Field(["string"]) declare extensionKeys: string[];
  @Field("string") declare revision: string;
  @Field("string") declare membershipPhase: InviteMembershipPhase;
  @Field("string") declare replacementPhase: InviteMembershipPhase;
  @Index({ crossInstance: true }) @Field("boolean") declare completed: boolean;
  @Field("date") declare decidedAt: Date;
}
