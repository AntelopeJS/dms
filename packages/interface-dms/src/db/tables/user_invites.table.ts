import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "../../constants";
import type { InviteExtensionPayloads } from "../../invite-extension-payloads";
import { Role } from "./roles.table";

export const USER_INVITES_TABLE_NAME = "user_invites";
const PENDING_INVITE_INDEX = "email_creationResolutionId";

@RegisterTable(USER_INVITES_TABLE_NAME, TENANT_SCHEMA_NAME)
export class UserInvite extends Table {
  @Field("string")
  declare _id: string;

  @Index({ crossInstance: true })
  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Index({ group: PENDING_INVITE_INDEX, unique: true })
  @Index({ crossInstance: true })
  @Field("string")
  declare email: string;

  @Field("string")
  declare firstname: string | null;

  @Field("string")
  declare lastname: string | null;

  @Field(["string"])
  @Relation({ to: () => Role, many: true })
  declare roles_ids: string[];

  @Field("string")
  declare language: string;

  @Index({ crossInstance: true })
  @Field("string")
  declare token: string;

  @Field("boolean")
  declare asTenantOwner: boolean;

  @Index({ crossInstance: true })
  @Field("date")
  declare expiresAt: Date;

  /**
   * Id of the resolution that created this invitation as a replacement, which
   * is actionable only once that resolution completes. Empty for an invitation
   * created without one: unique with `email`, so concurrent invitations of one
   * email keep a single row.
   */
  @Index({ group: PENDING_INVITE_INDEX, unique: true })
  @Field("string")
  declare creationResolutionId?: string;

  /**
   * Id of the user who sent the invitation, or last resent it. `null` for an
   * invitation created outside a signed-in request (an import, a module).
   */
  @Field("string")
  declare invitedBy?: string | null;

  /**
   * Payloads modules attached to the invitation through
   * `RegisterInviteExtension`, keyed by extension key. Delivered to their
   * owners when the invitee joins, and gone with the row when it does not.
   */
  @Field("any")
  declare extensions: InviteExtensionPayloads | null;
}
