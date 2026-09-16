import {
  CreationTime,
  Field,
  Hashed,
  HashModifier,
  Index,
  RegisterTable,
  Table,
  UpdateTime,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "../../../constants";
import type { DefaultDataTypes } from "../../../base/data-types/default-types";

export const USERS_TABLE_NAME = "users";

@RegisterTable(USERS_TABLE_NAME, CORE_SCHEMA_NAME)
export class User extends Table.with(HashModifier) {
  /* 📅 Meta */
  @Field("string")
  declare _id: string;

  @Index()
  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Index()
  @UpdateTime()
  @Field("date")
  declare updatedAt: Date;

  /* 🎭 Personal informations */
  @Index()
  @Field("string")
  declare email: string;

  @Field("string")
  declare name: string;

  /**
   * Profile picture as an image value ({ key, alt? }) in the default storage,
   * downscaled client-side to a square of at most 100x100 pixels.
   */
  @Field("any")
  declare avatar: DefaultDataTypes.ImageValue | null;

  /**
   * User's preferred language/locale (e.g., 'en', 'fr')
   */
  @Index()
  @Field("string")
  declare language: string;

  /* 🔑 Authentication data */
  @Hashed()
  @Field("string")
  declare password: string | null;

  /* ⚙️ Extra Meta */

  /**
   * Authentication key used for JWT secret generation
   */
  @Field("string")
  declare authKey: string;

  /**
   * Is the user email validated?
   */
  @Index()
  @Field("boolean")
  declare isValidated: boolean;

  /**
   * Token for email validation
   */
  @Index()
  @Field("string")
  declare validationToken: string | null;

  /**
   * Date when the validation token was requested
   */
  @Field("date")
  declare validationRequestedAt: Date | null;

  /**
   * Token for password reset
   */
  @Index()
  @Field("string")
  declare forgotPasswordToken: string | null;

  /**
   * Date when the forgot password token was requested
   */
  @Field("date")
  declare forgotPasswordRequestedAt: Date | null;

  /**
   * Is the user an owner with full access to everything?
   */
  @Field("boolean")
  declare owner: boolean;

  @Field(["string"])
  declare twoFactorMethods: string[];

  @Field("string")
  declare twoFactorSecret: string | null;

  @Field("string")
  declare twoFactorPendingSecret: string | null;

  @Field(["string"])
  declare twoFactorBackupCodes: string[];

  @Field("string")
  declare twoFactorEmailCode: string | null;

  @Field("date")
  declare twoFactorEmailCodeRequestedAt: Date | null;
}
