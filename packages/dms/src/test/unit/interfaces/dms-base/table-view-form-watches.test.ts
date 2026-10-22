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
  type FormBuilder,
  FormEvents,
  FormFunctions,
} from "@antelopejs/interface-dms/base/form-types";
import {
  Column,
  TableView,
  type TableViewOptionsSerialized,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import {
  ComponentId,
  type WatchAction,
} from "@antelopejs/interface-dms/base/types/watch";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
import {
  type ComponentNodeMap,
  filterComponents,
} from "@antelopejs/interface-dms/page/layout-filter";

const TABLE = "form-watch-contacts";
const PAGE_PERMISSION_ID = "pages.form-watch-demo";
const COMPONENT_PERMISSION_ID = `${PAGE_PERMISSION_ID}.table`;
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

const SHOW_COMPANY = {
  params: { targetField: "companyName", setHidden: false },
  onParam: [
    { key: "fieldId", value: "kind" },
    { key: "value", value: "company" },
  ],
};

const showCompany = (form: FormBuilder) =>
  form.watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_HIDDEN, {
    ...SHOW_COMPANY,
  });

const forms = {
  new: (form: FormBuilder) =>
    showCompany(form).watch(
      FormEvents.FIELD_CHANGE,
      FormFunctions.SET_FIELD_REQUIRED,
      {
        params: { targetField: "companyName", setRequired: true },
        requirePermission: SALES_PERMISSION,
      },
    ),
  edit: showCompany,
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

/** The table view's options as the page serves them to a caller. */
async function servedOptions(
  permissions: string[],
): Promise<TableViewOptionsSerialized> {
  const table = TableView(ContactAPI, { forms, realtime: false });
  const componentMap: ComponentNodeMap = new Map([
    [
      COMPONENT_PERMISSION_ID,
      {
        component: table,
        permissionId: COMPONENT_PERMISSION_ID,
        depth: 0,
        access: "own",
      },
    ],
  ]);
  const served = await filterComponents(
    { table: table.serializeSync() },
    PAGE_PERMISSION_ID,
    new Set(withPermissionAncestors(permissions)),
    componentMap,
    { tenantId: "form-watch-tenant", user: undefined },
  );
  if (!served.table) throw new Error("the table view was not served");
  return served.table.options as TableViewOptionsSerialized;
}

const ROW_ACTIONS = ["add", "edit", "view"].map(
  (action) => `${COMPONENT_PERMISSION_ID}.${action}`,
);

describe("[unit] interfaces/dms-base — table view form watches", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
  });

  it("hands each kind's generated form to its callback, before embedding it", () => {
    const table = TableView(ContactAPI, { forms, realtime: false });
    const options = table.serializeSync().options as TableViewOptionsSerialized;
    const editOptions = options.formComponents.edit?.options as
      | { watchActions: WatchAction[] }
      | undefined;
    const [watch] = editOptions?.watchActions ?? [];

    expect(watchesOf(options)).to.deep.equal({
      new: [FormFunctions.SET_FIELD_HIDDEN, FormFunctions.SET_FIELD_REQUIRED],
      edit: [FormFunctions.SET_FIELD_HIDDEN],
      view: undefined,
    });
    expect(watch).to.deep.equal({
      component: ComponentId.SELF,
      event: FormEvents.FIELD_CHANGE,
      functionId: FormFunctions.SET_FIELD_HIDDEN,
      ...SHOW_COMPANY,
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

  it("adds no watch unless a callback declares one", () => {
    const table = TableView(ContactAPI, { realtime: false });
    const options = table.serializeSync().options as TableViewOptionsSerialized;

    expect(watchesOf(options)).to.deep.equal({
      new: undefined,
      edit: undefined,
      view: undefined,
    });
  });
});
