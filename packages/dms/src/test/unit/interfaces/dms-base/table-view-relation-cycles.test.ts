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
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { TableView } from "@antelopejs/interface-dms/base/table-view/factory";
import { Column } from "@antelopejs/interface-dms/base/table-view/meta";
import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view/options";
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
  addForm?: { options?: unknown };
}

interface SerializedForm {
  options?: {
    fields?: { id: string; component: { options?: RelationOptions } }[];
  };
}

type TableOptions = TableViewOptionsSerialized & {
  columns: {
    id: string;
    type?: { inputComponent: { options?: RelationOptions } };
  }[];
};

function tableOptions(controller: ControllerClass): TableOptions {
  // SAFETY: a TableView serializes its columns with their data types.
  return TableView(controller).serializeSync().options as TableOptions;
}

function relationOptions(
  form: { options?: unknown } | undefined,
  id: string,
): RelationOptions | undefined {
  // SAFETY: a serialized Form, the add form included, holds its fields there.
  const fields = (form as SerializedForm | undefined)?.options?.fields;
  return fields?.find((field) => field.id === id)?.component.options;
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
      const { formComponents } = tableOptions(EmployeeAPI);

      const manager = relationOptions(formComponents.new, "manager");
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
      const { formComponents } = tableOptions(TeamAPI);

      const lead = relationOptions(formComponents.new, "lead");
      const team = relationOptions(lead?.addForm, "team");
      expect(team?.searchUrl).to.equal("/relation-cycles-test/teams/select");
      const back = relationOptions(team?.addForm, "lead");
      expect(back?.searchUrl).to.equal("/relation-cycles-test/members/select");
      expect(back?.addForm).to.equal(undefined);
    });
  });
});
