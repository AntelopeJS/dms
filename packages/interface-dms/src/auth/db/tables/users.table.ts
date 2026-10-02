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

/** First day of the week: 0 Sunday, 1 Monday, 6 Saturday. */
export type UserWeekStart = 0 | 1 | 6;

/** `h23`: 24-hour clock (14:05); `h12`: 12-hour clock (2:05 PM). */
export type UserTimeFormat = "h23" | "h12";

/** `numeric`: 01/10/2026; `text`: the month as a word (1 Oct 2026). */
export type UserDateFormat = "numeric" | "text";

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

  /* 🌍 Regional preferences — unset or null follows the browser and the language */

  /** IANA time zone dates and times are shown in (`Europe/Brussels`). */
  @Field("string")
  declare timeZone?: string | null;

  /** First day of the week in calendars and date pickers. */
  @Field("number")
  declare weekStart?: UserWeekStart | null;

  /** Clock used for times. */
  @Field("string")
  declare timeFormat?: UserTimeFormat | null;

  /** How full dates are written. */
  @Field("string")
  declare dateFormat?: UserDateFormat | null;

  /* 🔑 Authentication data */
  @Hashed()
  @Field("string")
  declare password: string | null;

  /**
   * When the password was last set by the user (change or recovery); null
   * for accounts that never changed it since this field exists.
   */
  @Field("date")
  declare passwordChangedAt: Date | null;

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

  /**
   * Last time the user was seen using the dashboard with a valid access token.
   * Written at most once per `USER_ACTIVITY_WRITE_INTERVAL_MS`, so it is
   * accurate to that interval; `null` until the first authenticated request.
   */
  @Field("date")
  declare lastActiveAt: Date | null;

  @Field(["string"])
  declare twoFactorMethods: string[];

  @Field("string")
  declare twoFactorSecret: string | null;

  @Field("string")
  declare twoFactorPendingSecret: string | null;

  @Field(["string"])
  declare twoFactorBackupCodes: string[];

  /** When the current set of backup codes was generated. */
  @Field("date")
  declare twoFactorBackupCodesGeneratedAt: Date | null;

  /**
   * When the user confirmed they kept the current backup codes (downloaded,
   * copied or acknowledged); null until then.
   */
  @Field("date")
  declare twoFactorBackupCodesSavedAt: Date | null;

  @Field("string")
  declare twoFactorEmailCode: string | null;

  @Field("date")
  declare twoFactorEmailCodeRequestedAt: Date | null;
}
