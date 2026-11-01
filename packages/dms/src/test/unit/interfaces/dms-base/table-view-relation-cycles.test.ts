import { Controller, type ControllerClass } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { z } from "zod";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { TableView } from "@antelopejs/interface-dms/base/table-view/factory";
import { Column } from "@antelopejs/interface-dms/base/table-view/meta";
import { TableViewRoutes } from "@antelopejs/interface-dms/base/table-view/routes";

const SCHEMA = "relation-cycles-test";

@RegisterTable("employees", SCHEMA)
class Employee extends Table {
  @Field("string") declare name: string;
  @Field("string") declare manager: string;
  @Field("string") declare home: string;
}
class EmployeeModel extends BasicDataModel(Employee, "employees") {}

@RegisterDataController()
class EmployeeAPI extends DataController(
  Employee,
  TableViewRoutes.All,
  Controller("/relation-cycles-test/employees"),
) {
  @ModelReference()
  @Model(EmployeeModel)
  declare model: EmployeeModel;

  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare name: string;

  declare manager: string;
  declare home: string;
}

@RegisterTable("teams", SCHEMA)
class Team extends Table {
  @Field("string") declare name: string;
  @Field("string") declare lead: string;
}
class TeamModel extends BasicDataModel(Team, "teams") {}

@RegisterDataController()
class TeamAPI extends DataController(
  Team,
  TableViewRoutes.All,
  Controller("/relation-cycles-test/teams"),
) {
  @ModelReference()
  @Model(TeamModel)
  declare model: TeamModel;

  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare name: string;

  declare lead: string;
}

@RegisterTable("members", SCHEMA)
class Member extends Table {
  @Field("string") declare name: string;
  @Field("string") declare team: string;
}
class MemberModel extends BasicDataModel(Member, "members") {}

@RegisterDataController()
class MemberAPI extends DataController(
  Member,
  TableViewRoutes.All,
  Controller("/relation-cycles-test/members"),
) {
  @ModelReference()
  @Model(MemberModel)
  declare model: MemberModel;

  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare name: string;

  declare team: string;
}

function relateTo(
  from: ControllerClass,
  key: string,
  to: ControllerClass,
): void {
  Column({
    name: key,
    type: new DefaultDataTypes.RelationType({
      dataApiController: to,
      keyMapping: { label: "name" },
    }),
  })(from.prototype, key);
  Access(AccessMode.ReadWrite)(from.prototype, key);
}

relateTo(EmployeeAPI, "manager", EmployeeAPI);
Column({
  name: "home",
  type: new DefaultDataTypes.AddressType({ dataApiController: EmployeeAPI }),
})(EmployeeAPI.prototype, "home");
Access(AccessMode.ReadWrite)(EmployeeAPI.prototype, "home");
relateTo(TeamAPI, "lead", MemberAPI);
relateTo(MemberAPI, "team", TeamAPI);

interface RelationOptions {
  searchUrl?: string;
  addForm?: SerializedForm;
}

interface SerializedForm {
  options?: {
    fields?: { id: string; component: { options?: RelationOptions } }[];
  };
}

const relationOptionsSchema: z.ZodType<RelationOptions> = z.lazy(() =>
  z.object({
    searchUrl: z.string().optional(),
    addForm: formSchema.optional(),
  }),
);

const formSchema: z.ZodType<SerializedForm> = z.object({
  options: z
    .object({
      fields: z
        .array(
          z.object({
            id: z.string(),
            component: z.object({ options: relationOptionsSchema.optional() }),
          }),
        )
        .optional(),
    })
    .optional(),
});

const tableOptionsSchema = z.object({
  columns: z.array(
    z.object({
      id: z.string(),
      type: z
        .object({
          inputComponent: z.object({
            options: relationOptionsSchema.optional(),
          }),
        })
        .optional(),
    }),
  ),
  formComponents: z.object({ new: formSchema.optional() }),
});

type TableOptions = z.infer<typeof tableOptionsSchema>;

function tableOptions(controller: ControllerClass): TableOptions {
  return tableOptionsSchema.parse(
    TableView(controller).serializeSync().options,
  );
}

function relationOptions(
  form: SerializedForm | undefined,
  id: string,
): RelationOptions | undefined {
  return form?.options?.fields?.find((field) => field.id === id)?.component
    .options;
}

function columnSearchUrl(
  options: TableOptions,
  id: string,
): string | undefined {
  return options.columns.find((column) => column.id === id)?.type
    ?.inputComponent.options?.searchUrl;
}

/**
 * A relation whose related table leads back to it, directly or through
 * another table, still builds: the picker searches the related controller's
 * select route, and the add form nests once, then leaves out the add form of
 * the relation that would build it again.
 */
describe("[unit] interfaces/dms-base/table-view-relation-cycles — cyclic relations", () => {
  describe("a self-relation", () => {
    it("builds the picker on the controller's own select route", () => {
      const options = tableOptions(EmployeeAPI);

      expect(columnSearchUrl(options, "manager")).to.equal(
        "/relation-cycles-test/employees/select",
      );
    });

    it("nests the add form once, without the add form that loops", () => {
      const manager = relationOptions(
        tableOptions(EmployeeAPI).formComponents.new,
        "manager",
      );
      expect(manager?.searchUrl).to.equal(
        "/relation-cycles-test/employees/select",
      );
      const nested = relationOptions(manager?.addForm, "manager");
      expect(nested?.searchUrl).to.equal(
        "/relation-cycles-test/employees/select",
      );
      expect(nested?.addForm).to.equal(undefined);
    });
  });

  describe("an address searching its own table", () => {
    it("builds its search on the controller's own select route", () => {
      expect(columnSearchUrl(tableOptions(EmployeeAPI), "home")).to.equal(
        "/relation-cycles-test/employees/select",
      );
    });
  });

  describe("a two-table cycle", () => {
    it("builds the picker on each side's related select route", () => {
      expect(columnSearchUrl(tableOptions(TeamAPI), "lead")).to.equal(
        "/relation-cycles-test/members/select",
      );
      expect(columnSearchUrl(tableOptions(MemberAPI), "team")).to.equal(
        "/relation-cycles-test/teams/select",
      );
    });

    it("keeps the add form of the other table and leaves out the one back", () => {
      const lead = relationOptions(
        tableOptions(TeamAPI).formComponents.new,
        "lead",
      );
      const team = relationOptions(lead?.addForm, "team");
      expect(team?.searchUrl).to.equal("/relation-cycles-test/teams/select");
      const back = relationOptions(team?.addForm, "lead");
      expect(back?.searchUrl).to.equal("/relation-cycles-test/members/select");
      expect(back?.addForm).to.equal(undefined);
    });
  });
});
