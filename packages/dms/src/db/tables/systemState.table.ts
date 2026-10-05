import {
  Field,
  Fixture,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

export const systemStateTableName = "system_state";

const defaultSystemState: Partial<SystemState>[] = [
  {
    has_onboarded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

@Fixture(() => defaultSystemState)
@RegisterTable(systemStateTableName, CORE_SCHEMA_NAME)
export class SystemState extends Table {
  @Field("string") declare _id: string;

  @Field("boolean") declare has_onboarded: boolean;

  /** Platform name chosen during onboarding; the configured meta title otherwise. */
  @Field("string") declare platform_name?: string;

  /** Language chosen during onboarding for the administrator account. */
  @Field("string") declare default_language?: string;

  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}
