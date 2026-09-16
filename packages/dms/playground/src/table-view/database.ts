import {
  BasicDataModel,
  Field,
  Fixture,
  Index,
  LocalizationModifier,
  Localized,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import type { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { defaultTasks, defaultUsers } from "./defaultValues";

const tableName = "playground_tasks";

@RegisterTable(tableName, CORE_SCHEMA_NAME)
@Fixture(() =>
  defaultTasks.map((task) => {
    const data = TaskModel.fromPlainData(task);
    data.localize("en");

    return data;
  }),
)
export class Task extends Table.with(LocalizationModifier) {
  @Field("string") declare _id: string;

  @Localized()
  @Field("string")
  declare name: string;
  @Field("string") declare owner: string;
  @Field("string") declare email: string;
  @Index() @Field("string") declare status:
    | "pending"
    | "in_progress"
    | "completed"
    | "cancelled";
  @Field("string") declare priority: "low" | "medium" | "high";
  @Index() @Field("boolean") declare isArchived?: boolean;

  @Localized()
  @Field("string")
  declare description: string;
  @Index() @Field("date") declare due_date: Date;

  @Field("string")
  @Relation({ to: () => User })
  declare assignees?: string;

  @Field("number") declare price: number;
  @Field("number") declare completion_percentage: number;

  @Field("string") declare url: string;
  @Field("string") declare phone?: string;
  @Field("boolean") declare done?: boolean;

  @Field("any") declare address?: DefaultDataTypes.Address;

  @Field("any") declare thumbnail?: DefaultDataTypes.ImageValue;
  @Field(["any"]) declare photos?: DefaultDataTypes.ImageValue[];

  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}

export class TaskModel extends BasicDataModel(Task, tableName) {}

const tableName2 = "playground_users";

@RegisterTable(tableName2, CORE_SCHEMA_NAME)
@Fixture(() => defaultUsers)
export class User extends Table {
  @Field("string") declare _id: string;

  @Field("string") declare name: string;
  @Field("string") declare email: string;
  @Field("string") declare phone?: string;
  @Field("string") declare avatar?: string;

  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}

export class UserModel extends BasicDataModel(User, tableName2) {}
