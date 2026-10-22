import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Computed,
  Listable,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import type { ValueProxy } from "@antelopejs/interface-database";
import {
  BasicDataModel,
  Field,
  Index,
  Model,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import {
  RegisterPage,
  RootPageController,
} from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  Select,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

// Tasks with fields the database computes: `remaining` declares no access of
// its own (`@Computed` makes it read-only), `shout` does. Neither is filtered
// nor sorted by default, so the list must compute them for its page.

const TABLE = "computed-tasks";
const PROJECT_TABLE = "computed-projects";

@RegisterTable(PROJECT_TABLE, CORE_SCHEMA_NAME)
export class ComputedProject extends Table {
  @Field("string") declare name: string;
}

export class ComputedProjectModel extends BasicDataModel(
  ComputedProject,
  PROJECT_TABLE,
) {}

@RegisterDataController()
export class ComputedProjectController extends DataController(
  ComputedProject,
  TableViewRoutes.All,
  Controller("/api/computed/projects"),
) {
  @ModelReference()
  @Model(ComputedProjectModel)
  declare model: ComputedProjectModel;

  @Listable()
  @Select()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Select()
  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare name: string;
}

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
export class ComputedTask extends Table {
  @Field("string") declare title: string;
  @Field("number") declare estimate: number;
  @Field("number") declare spent: number;
  @Index() @Field("string") declare projectId?: string;
}

export class ComputedTaskModel extends BasicDataModel(ComputedTask, TABLE) {}

@RegisterDataController()
export class ComputedTaskController extends DataController(
  ComputedTask,
  TableViewRoutes.All,
  Controller("/api/computed/tasks"),
) {
  @ModelReference()
  @Model(ComputedTaskModel)
  declare model: ComputedTaskModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Listable()
  @Sortable()
  @Column({ name: "Title", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare title: string;

  @Listable()
  @Column({ name: "Estimate", type: new DefaultDataTypes.NumberType() })
  @Access(AccessMode.ReadWrite)
  declare estimate: number;

  @Listable()
  @Column({ name: "Spent", type: new DefaultDataTypes.NumberType() })
  @Access(AccessMode.ReadWrite)
  declare spent: number;

  @Listable()
  @Sortable()
  @Column({ name: "Remaining", type: new DefaultDataTypes.NumberType() })
  @Computed((row) =>
    (row.key("estimate") as ValueProxy<number>).sub(
      row.key("spent") as ValueProxy<number>,
    ),
  )
  declare remaining: number;

  @Listable()
  @Column({
    name: "Project",
    type: new DefaultDataTypes.RelationType({
      dataApiController: ComputedProjectController,
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare projectId: string;

  // A sub-query on the table: the tasks of the same project.
  @Listable()
  @Column({ name: "Siblings", type: new DefaultDataTypes.NumberType() })
  @Computed(
    (row, db) =>
      db.table(TABLE).getAll(row.key("projectId"), "projectId").count(),
    { default: 0 },
  )
  declare siblings: number;

  @Listable()
  @Column({ name: "Shout", type: new DefaultDataTypes.StringType() })
  @Computed((row) => (row.key("title") as ValueProxy<string>).upcase())
  @Access(AccessMode.ReadOnly)
  declare shout: string;
}

@RegisterPage()
export class ComputedTasksPage extends RootPageController("computed-tasks", {
  displayName: "Tasks",
}) {
  static content = TableView(ComputedTaskController, {
    realtime: false,
    rowActions: { add: true, edit: true },
    // Guards amending the body their route writes.
    guards: {
      new: (_ctx, { body }) => {
        body.spent ??= 0;
      },
      edit: (_ctx, { body }) => {
        if (typeof body.title === "string") body.title = body.title.trim();
      },
    },
  });
}
