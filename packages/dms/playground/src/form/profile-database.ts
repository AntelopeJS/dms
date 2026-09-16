import {
  BasicDataModel,
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import type { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";

const tableName = "playground_profiles";

export interface DateRange {
  start: string;
  end: string;
}

export enum Gender {
  male = "male",
  female = "female",
  other = "other",
  preferNotToSay = "prefer-not-to-say",
}

export enum MaritalStatus {
  single = "single",
  married = "married",
  divorced = "divorced",
  widowed = "widowed",
}

export enum Theme {
  light = "light",
  dark = "dark",
  auto = "auto",
}

@RegisterTable(tableName, CORE_SCHEMA_NAME)
export class Profile extends Table {
  @Field("string") declare _id: string;

  @Index()
  @Field("string")
  declare userId: string;

  @Field("string") declare avatar: string;

  @Field("any") declare coverImage: DefaultDataTypes.ImageValue;
  @Field(["any"]) declare gallery: DefaultDataTypes.ImageValue[];

  @Field("string") declare firstName: string;
  @Field("string") declare lastName: string;
  @Field("string") declare email: string;
  @Field("string") declare phone: string;

  @Field("date") declare birthDate: Date;

  @Field("any") declare vacationDates: DateRange;

  @Field("string") declare gender: Gender;
  @Field("string") declare maritalStatus: MaritalStatus;
  @Field("string") declare country: string;
  @Field("string") declare theme: Theme;
  @Field("string") declare language: string;
  @Field("string") declare timezone: string;
  @Field("string") declare currency: string;

  @Field("string") declare city: string;
  @Field("string") declare jobTitle: string;
  @Field("string") declare company: string;
  @Field("string") declare website: string;
  @Field("string") declare linkedinUrl: string;
  @Field("string") declare githubUrl: string;
  @Field("string") declare twitterUrl: string;

  @Field("string") declare address: string;
  @Field("string") declare bio: string;

  @Field("number") declare experience: number;
  @Field("number") declare salary: number;
  @Field("number") declare profileCompleteness: number;

  @Field("string") declare postalCode: string;

  @Field(["string"]) declare skills: string[];
  @Field(["string"]) declare notifications: string[];

  @Field("string") declare department: string;

  @Field("boolean") declare newsletter: boolean;
  @Field("boolean") declare twoFactorAuth: boolean;
  @Field("boolean") declare profilePublic: boolean;

  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}

export class ProfileModel extends BasicDataModel(Profile, tableName) {}
