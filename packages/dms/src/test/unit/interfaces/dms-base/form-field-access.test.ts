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
import {
  type FormField,
  type FormFieldOrGroup,
  isFieldGroup,
} from "@antelopejs/interface-dms/base/form-types";
import {
  Column,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view/meta";
import { TableViewRoutes } from "@antelopejs/interface-dms/base/table-view/routes";
import { ReadonlyBehaviorType } from "@antelopejs/interface-dms/base/types/readonly-behavior";
import { GetMetadata } from "@antelopejs/interface-core";

const SCHEMA = "form-field-access-test";
const TABLE = "orders";

@RegisterTable(TABLE, SCHEMA)
class Order extends Table {
  @Field("string")
  declare reference: string;
  @Field("string")
  declare customer: string;
  @Field("string")
  declare status: string;
  @Field("string")
  declare note: string;
  @Field("string")
  declare createdBy: string;
}
class OrderModel extends BasicDataModel(Order, TABLE) {}

@RegisterDataController()
class OrderAPI extends DataController(
  Order,
  TableViewRoutes.All,
  Controller("/form-field-access-test"),
) {
  @ModelReference()
  @Model(OrderModel)
  declare model: OrderModel;

  @Column({ name: "Reference", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite, { edit: AccessMode.ReadOnly })
  declare reference: string;

  @Column({
    name: "Customer",
    type: new DefaultDataTypes.StringType(),
    readonlyBehavior: { new: ReadonlyBehaviorType.hidden },
  })
  @Access(AccessMode.ReadWrite, { new: AccessMode.ReadOnly })
  declare customer: string;

  @Column({ name: "Status", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly, { new: AccessMode.ReadWrite })
  declare status: string;

  @Column({ name: "Note", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare note: string;

  @Column({
    name: "Created by",
    type: new DefaultDataTypes.StringType(),
    readonlyBehavior: {
      new: ReadonlyBehaviorType.hidden,
      edit: ReadonlyBehaviorType.disabled,
    },
  })
  @Access(AccessMode.ReadOnly)
  declare createdBy: string;
}

function ungrouped(entry: FormFieldOrGroup): FormField {
  if (isFieldGroup(entry)) throw new Error("expected an ungrouped field");
  return entry;
}

function formFields(mode: "new" | "edit" | "view"): Map<string, FormField> {
  const meta = GetMetadata(OrderAPI, TableViewMeta);
  const fields = meta.getFormFields(mode).map(ungrouped);
  return new Map(fields.map((field) => [field.id, field]));
}

/**
 * A generated form honours a column's access in the mode it is for: the
 * per-action override of `@Access` the data API applies to the value it
 * writes, and the `readonlyBehavior` of a field read-only in that mode.
 */
describe("[unit] interfaces/dms-base/form-field-access — per-mode access in generated forms", () => {
  it("disables a field read-only in that mode only", () => {
    expect(formFields("new").get("reference")?.disabled).to.equal(false);
    expect(formFields("edit").get("reference")?.disabled).to.equal(true);
  });

  it("opens a field writable in that mode only", () => {
    expect(formFields("new").get("status")?.disabled).to.equal(false);
    expect(formFields("edit").get("status")?.disabled).to.equal(true);
  });

  it("applies the readonlyBehavior of a field read-only by its override", () => {
    expect(formFields("new").has("customer")).to.equal(false);
    expect(formFields("edit").get("customer")?.disabled).to.equal(false);
  });

  it("keeps the default access and its readonlyBehavior elsewhere", () => {
    expect(formFields("new").get("note")?.disabled).to.equal(false);
    expect(formFields("edit").get("note")?.disabled).to.equal(false);
    expect(formFields("new").has("createdBy")).to.equal(false);
    expect(formFields("edit").get("createdBy")?.disabled).to.equal(true);
    expect(
      [...formFields("view").values()].every((field) => field.disabled),
    ).to.equal(true);
  });
});
