import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "../../../constants";
import { User } from "./users.table";

export const SESSIONS_TABLE_NAME = "sessions";

@RegisterTable(SESSIONS_TABLE_NAME, CORE_SCHEMA_NAME)
export class Session extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @Field("string")
  @Relation({ to: () => User })
  declare userId: string;

  /** sha256 of the current refresh token: the token itself is never stored. */
  @Field("string")
  declare refreshTokenHash?: string | null;

  /**
   * The current refresh token sealed under a key only its predecessor
   * derives, so the rotation grace window can hand it back to a client that
   * still holds the predecessor without the token being readable at rest.
   */
  @Field("string")
  declare sealedRefreshToken?: string | null;

  @Field("string")
  declare previousRefreshTokenHash?: string | null;

  @Field("date")
  declare refreshTokenRotatedAt?: Date | null;

  @Field("string")
  declare userAgent: string;

  @Field("string")
  declare ip: string;

  @Field("string")
  declare browser: string;

  @Field("string")
  declare os: string;

  @Field("string")
  declare deviceType: string;

  @Field("string")
  declare location: string;

  @Index()
  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Index()
  @Field("date")
  declare lastActiveAt: Date;
}
