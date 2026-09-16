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

  @Field("string")
  declare refreshToken: string;

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

  @Field("date")
  declare lastActiveAt: Date;
}
