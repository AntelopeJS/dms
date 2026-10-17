import { Controller } from "@antelopejs/interface-api";
import { ImplementInterface } from "@antelopejs/interface-core";
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
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  FormEvents,
  FormFunctions,
} from "@antelopejs/interface-dms/base/form-types";
import {
  Column,
  TableView,
  type TableViewFormWatch,
  type TableViewOptionsSerialized,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import {
  ComponentId,
  type WatchAction,
} from "@antelopejs/interface-dms/base/types/watch";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";

const TABLE = "form-watch-contacts";
const COMPONENT_PERMISSION_ID = "pages.form-watch-demo.table";
const SALES_PERMISSION = "sales.manage";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Contact extends Table {
  @Field("string") declare kind: string;
  @Field("string") declare companyName: string;
}

class ContactModel extends BasicDataModel(Contact, TABLE) {}

@RegisterDataController()
class ContactAPI extends DataController(
  Contact,
  {
    list: TableViewRoutes.List,
    get: TableViewRoutes.Get,
    new: TableViewRoutes.New,
    edit: TableViewRoutes.Edit,
  },
  Controller("/api/form-watch-contacts"),
) {
  @ModelReference()
  @Model(ContactModel)
  declare model: ContactModel;
  @Column({ name: "Kind", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare kind: string;
  @Column({ name: "Company", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare companyName: string;
}

const SHOW_COMPANY: TableViewFormWatch = {
  event: FormEvents.FIELD_CHANGE,
  functionId: FormFunctions.SET_FIELD_HIDDEN,
  params: { targetField: "companyName", setHidden: false },
  onParam: [
    { key: "fieldId", value: "kind" },
    { key: "value", value: "company" },
  ],
};

const REQUIRE_COMPANY: TableViewFormWatch = {
  event: FormEvents.FIELD_CHANGE,
  functionId: FormFunctions.SET_FIELD_REQUIRED,
  params: { targetField: "companyName", setRequired: true },
  requirePermission: SALES_PERMISSION,
};

const formWatches = {
  new: [SHOW_COMPANY, REQUIRE_COMPANY],
  edit: [SHOW_COMPANY],
};

function watchesOf(
  options: TableViewOptionsSerialized,
): Record<string, string[] | undefined> {
  return Object.fromEntries(
    Object.entries(options.formComponents).map(([kind, form]) => [
      kind,
      (
        form?.options as { watchActions?: WatchAction[] } | undefined
      )?.watchActions?.map((watch) => watch.functionId),
    ]),
  );
}

async function servedOptions(
  permissions: string[],
): Promise<TableViewOptionsSerialized> {
  const builder = TableView(ContactAPI, { formWatches, realtime: false });
  const { options } = builder.serializeSync();
  const filter = builder.onFilterCallback;
  if (!filter || !options) throw new Error("table view without a filter");
  return filter(
    new Set(withPermissionAncestors(permissions)),
    options,
    COMPONENT_PERMISSION_ID,
    { tenantId: "form-watch-tenant", user: undefined },
  );
}

const ROW_ACTIONS = ["add", "edit", "view"].map(
  (action) => `${COMPONENT_PERMISSION_ID}.${action}`,
);

describe("[unit] interfaces/dms-base — table view form watches", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
  });

  it("declares each kind's watches on its generated form, as .watch() does", () => {
    const table = TableView(ContactAPI, { formWatches, realtime: false });
    const options = table.serializeSync().options as TableViewOptionsSerialized;
    const [watch] = (
      options.formComponents.edit?.options as { watchActions: WatchAction[] }
    ).watchActions;

    expect(watchesOf(options)).to.deep.equal({
      new: [FormFunctions.SET_FIELD_HIDDEN, FormFunctions.SET_FIELD_REQUIRED],
      edit: [FormFunctions.SET_FIELD_HIDDEN],
      view: undefined,
    });
    expect(watch).to.deep.equal({
      component: ComponentId.SELF,
      event: FormEvents.FIELD_CHANGE,
      functionId: FormFunctions.SET_FIELD_HIDDEN,
      params: SHOW_COMPANY.params,
      onParam: SHOW_COMPANY.onParam,
    });
  });

  it("serves a watch requiring a permission only to a caller holding it", async () => {
    const withSales = await servedOptions([...ROW_ACTIONS, SALES_PERMISSION]);
    const without = await servedOptions(ROW_ACTIONS);

    expect(watchesOf(withSales).new).to.deep.equal([
      FormFunctions.SET_FIELD_HIDDEN,
      FormFunctions.SET_FIELD_REQUIRED,
    ]);
    expect(watchesOf(without).new).to.deep.equal([
      FormFunctions.SET_FIELD_HIDDEN,
    ]);
    expect(watchesOf(without).edit).to.deep.equal([
      FormFunctions.SET_FIELD_HIDDEN,
    ]);
  });

  it("adds no watch unless one is declared", () => {
    const table = TableView(ContactAPI, { realtime: false });
    const options = table.serializeSync().options as TableViewOptionsSerialized;

    expect(watchesOf(options)).to.deep.equal({
      new: undefined,
      edit: undefined,
      view: undefined,
    });
  });
});
