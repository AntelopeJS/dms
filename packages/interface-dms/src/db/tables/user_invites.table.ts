import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "../../constants";
import type { InviteExtensionPayloads } from "../../invite-extensions/types";
import { Role } from "./roles.table";

export const USER_INVITES_TABLE_NAME = "user_invites";

@RegisterTable(USER_INVITES_TABLE_NAME, TENANT_SCHEMA_NAME)
export class UserInvite extends Table {
  /* 📅 Meta */
  @Field("string")
  declare _id: string;

  @Index()
  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Index()
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

  @Index()
  @Field("string")
  declare token: string;

  @Field("boolean")
  declare asTenantOwner: boolean;

  @Index()
  @Field("date")
  declare expiresAt: Date;

  /** A replacement is actionable only after its creating resolution completes. */
  @Field("string")
  declare creationResolutionId?: string;

  @Field("boolean")
  declare skipEmailValidation: boolean;

  /**
   * Payloads modules attached to the invitation through
   * `RegisterInviteExtension`, keyed by extension key. Delivered to their
   * owners when the invitee joins, and gone with the row when it does not.
   */
  @Field("any")
  declare extensions: InviteExtensionPayloads | null;
}
