import { Controller } from "@antelopejs/interface-api";
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
import type {
  FormFieldSerialized,
  FormPropsSerialized,
} from "@antelopejs/interface-dms/base/form";
import { TableView } from "@antelopejs/interface-dms/base/table-view/factory";
import { Column } from "@antelopejs/interface-dms/base/table-view/meta";
import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view/options";
import { TableViewRoutes } from "@antelopejs/interface-dms/base/table-view/routes";

const SCHEMA = "relation-payload-test";
const SITE_FIELDS = ["name", "city", "street", "zip", "country", "phone"];
const CUSTOMER_FIELDS = ["name", "email", "phone", "vat", "notes", "segment"];

const stringColumn = (name: string) =>
  Column({ name, type: new DefaultDataTypes.StringType() });

@RegisterTable("sites", SCHEMA)
class Site extends Table {
  @Field("string") declare name: string;
  @Field("string") declare city: string;
  @Field("string") declare street: string;
  @Field("string") declare zip: string;
  @Field("string") declare country: string;
  @Field("string") declare phone: string;
}
class SiteModel extends BasicDataModel(Site, "sites") {}

@RegisterDataController()
class SiteAPI extends DataController(
  Site,
  TableViewRoutes.All,
  Controller("/relation-payload-test/sites"),
) {
  @ModelReference()
  @Model(SiteModel)
  declare model: SiteModel;

  declare name: string;
  declare city: string;
  declare street: string;
  declare zip: string;
  declare country: string;
  declare phone: string;
}
for (const field of SITE_FIELDS) {
  stringColumn(field)(SiteAPI.prototype, field);
  Access(AccessMode.ReadWrite)(SiteAPI.prototype, field);
}

@RegisterTable("customers", SCHEMA)
class Customer extends Table {
  @Field("string") declare name: string;
  @Field("string") declare email: string;
  @Field("string") declare phone: string;
  @Field("string") declare vat: string;
  @Field("string") declare notes: string;
  @Field("string") declare segment: string;
  @Field("string") declare site: string;
}
class CustomerModel extends BasicDataModel(Customer, "customers") {}

@RegisterDataController()
class CustomerAPI extends DataController(
  Customer,
  TableViewRoutes.All,
  Controller("/relation-payload-test/customers"),
) {
  @ModelReference()
  @Model(CustomerModel)
  declare model: CustomerModel;

  @Column({
    name: "Site",
    type: new DefaultDataTypes.RelationType({
      dataApiController: SiteAPI,
      keyMapping: { label: "name" },
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare site: string;

  declare name: string;
  declare email: string;
  declare phone: string;
  declare vat: string;
  declare notes: string;
  declare segment: string;
}
for (const field of CUSTOMER_FIELDS) {
  stringColumn(field)(CustomerAPI.prototype, field);
  Access(AccessMode.ReadWrite)(CustomerAPI.prototype, field);
}

@RegisterTable("orders", SCHEMA)
class Order extends Table {
  @Field("string") declare reference: string;
  @Field("string") declare customer: string;
  @Field("string") declare site: string;
}
class OrderModel extends BasicDataModel(Order, "orders") {}

@RegisterDataController()
class OrderAPI extends DataController(
  Order,
  TableViewRoutes.All,
  Controller("/relation-payload-test/orders"),
) {
  @ModelReference()
  @Model(OrderModel)
  declare model: OrderModel;

  @Column({ name: "Reference", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare reference: string;

  @Column({
    name: "Customer",
    filterable: true,
    type: new DefaultDataTypes.RelationType({
      dataApiController: CustomerAPI,
      keyMapping: { label: "name" },
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare customer: string;

  @Column({
    name: "Site",
    type: new DefaultDataTypes.RelationType({
      dataApiController: SiteAPI,
      keyMapping: { label: "name" },
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare site: string;
}

const ADD_FORM_KEY = '"addForm"';

const sizeOf = (value: unknown): number => JSON.stringify(value ?? null).length;
const addFormsIn = (value: unknown): number =>
  JSON.stringify(value ?? null).split(ADD_FORM_KEY).length - 1;

interface SerializedColumn {
  id: string;
  type?: {
    inputComponent: { options?: Record<string, unknown> };
    filterComponents: Record<string, unknown>;
  };
}

type TableOptions = TableViewOptionsSerialized & {
  columns: SerializedColumn[];
};

function tableOptions(): TableOptions {
  return TableView(OrderAPI).serializeSync().options as TableOptions;
}

function formField(
  form: { options?: unknown } | undefined,
  id: string,
): FormFieldSerialized | undefined {
  const fields = (form?.options as FormPropsSerialized | undefined)?.fields;
  return (fields as FormFieldSerialized[] | undefined)?.find(
    (field) => field.id === id,
  );
}

/**
 * A relation column ships what its picker reads (the select route, the key
 * mapping), and the related table's "new" form only where a user can add a
 * row through it: an editable form field. A table column, its filter and a
 * read-only field fetch their rows through the select route and carry no
 * form.
 */
describe("[unit] interfaces/dms-base/table-view-relation-payload — relation columns", () => {
  it("leaves the related add form out of the column types", () => {
    const options = tableOptions();
    const customer = options.columns.find((column) => column.id === "customer");

    expect(addFormsIn(options.columns)).to.equal(0);
    expect(customer?.type?.inputComponent.options).to.include({
      searchUrl: "/relation-payload-test/customers/select",
    });
    expect(customer?.type?.filterComponents.default).to.not.equal("noInput");
  });

  it("keeps the add form where a row can be added: an editable field", () => {
    const { formComponents } = tableOptions();

    const editable = formField(formComponents.new, "customer");
    const editableOptions = editable?.component.options as
      | { addForm?: unknown }
      | undefined;
    expect(editableOptions?.addForm).to.not.equal(undefined);
    expect(addFormsIn(formComponents.view)).to.equal(0);
    const readOnly = formField(formComponents.edit, "site");
    expect(readOnly?.disabled).to.equal(true);
    expect(addFormsIn(readOnly)).to.equal(0);
  });

  it("weighs what the forms carry, not five copies per column", () => {
    const options = tableOptions();
    const { formComponents } = options;
    // Measured on this fixture: 29.9 KB in all, 11.6 KB of column types and
    // 15 add forms when every copy carried one; 12.1 KB, 1.8 KB and 4 since.
    console.log(
      `      payload: total ${sizeOf(options)} B, columns ${sizeOf(options.columns)} B, ` +
        `new ${sizeOf(formComponents.new)} B, edit ${sizeOf(formComponents.edit)} B, ` +
        `view ${sizeOf(formComponents.view)} B, add forms ${addFormsIn(options)}`,
    );
    expect(sizeOf(options.columns)).to.be.below(6_000);
    expect(sizeOf(formComponents.view)).to.be.below(6_000);
  });
});
