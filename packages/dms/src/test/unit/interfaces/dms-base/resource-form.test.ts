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
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import type {
  FormFieldSerialized,
  FormPropsSerialized,
} from "@antelopejs/interface-dms/base/form";
import { TableView } from "@antelopejs/interface-dms/base/table-view/factory";
import { Column } from "@antelopejs/interface-dms/base/table-view/meta";
import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view/options";
import { ResourceForm } from "@antelopejs/interface-dms/base/table-view/resource-form";
import { TableViewRoutes } from "@antelopejs/interface-dms/base/table-view/routes";
import { HttpMethod } from "@antelopejs/interface-dms/base/types/http";

const SCHEMA = "resource-form-test";
const TABLE = "tickets";
const LOCATION = "/resource-form-test";

@RegisterTable(TABLE, SCHEMA)
class Ticket extends Table {
  @Field("string")
  declare title: string;
  @Field("string")
  declare reference: string;
}
class TicketModel extends BasicDataModel(Ticket, TABLE) {}

@RegisterDataController()
class TicketAPI extends DataController(
  Ticket,
  TableViewRoutes.All,
  Controller(LOCATION),
) {
  @ModelReference()
  @Model(TicketModel)
  declare model: TicketModel;

  @Column({ name: "Title", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare title: string;

  @Column({ name: "Reference", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare reference: string;
}

function optionsOf(builder: {
  serializeSync: () => { options?: unknown };
}): FormPropsSerialized {
  return builder.serializeSync().options as FormPropsSerialized;
}

function fieldIds(options: FormPropsSerialized): string[] {
  return (options.fields as FormFieldSerialized[]).map((field) => field.id);
}

/**
 * A form over a table is picked, not assembled: the table and the mode decide
 * its fields and the routes it loads and submits through — the very form a
 * TableView over the same table opens.
 */
describe("[unit] interfaces/dms-base/resource-form — a form derived from its table", () => {
  it("is the form a TableView opens for the mode", () => {
    const table = TableView(TicketAPI).serializeSync()
      .options as TableViewOptionsSerialized;

    const created = optionsOf(ResourceForm(TicketAPI, { mode: "new" }));

    expect(created.submitUrl).to.equal(`${LOCATION}/new`);
    expect(created.submitUrlMethod).to.equal(HttpMethod.post);
    const opened = table.formComponents.new?.options as FormPropsSerialized;
    expect(created.fetchUrl).to.equal(opened.fetchUrl);
    expect(fieldIds(created)).to.deep.equal(fieldIds(opened));
  });

  it("opens the row the page's query string names, in edit and view", () => {
    const edited = optionsOf(ResourceForm(TicketAPI, { mode: "edit" }));
    const shown = optionsOf(ResourceForm(TicketAPI, { mode: "view" }));

    expect(edited.fetchUrl).to.match(
      new RegExp(`^${LOCATION}/get\\?id=\\{\\{query\\.id\\}\\}&`),
    );
    expect(edited.submitUrl).to.equal(`${LOCATION}/edit?id={{query.id}}`);
    expect(edited.submitUrlMethod).to.equal(HttpMethod.put);
    expect(shown.fetchUrl).to.equal(`${LOCATION}/get?id={{query.id}}`);
  });

  it("keeps the TableView's own pages on their :id segment", () => {
    const table = TableView(TicketAPI).serializeSync()
      .options as TableViewOptionsSerialized;

    const opened = table.formComponents.edit?.options as FormPropsSerialized;
    expect(opened.submitUrl).to.equal(`${LOCATION}/edit?id={{params.id}}`);
  });

  it("reads a row without offering anywhere to send it", () => {
    const shown = optionsOf(ResourceForm(TicketAPI, { mode: "view" }));

    expect(shown.submitUrl).to.equal(undefined);
    expect(
      (shown.fields as FormFieldSerialized[]).every((field) => field.disabled),
    ).to.equal(true);
  });

  it("carries its own wording and the row it was pointed at", () => {
    const edited = optionsOf(
      ResourceForm(TicketAPI, {
        mode: "edit",
        title: "Edit the ticket",
        submitLabel: "Save the ticket",
        rowId: "{{params.ticket}}",
      }),
    );

    expect(edited.title).to.equal("Edit the ticket");
    expect(edited.submitLabel).to.equal("Save the ticket");
    expect(edited.submitUrl).to.equal(`${LOCATION}/edit?id={{params.ticket}}`);
    expect(
      edited,
      "the row token is the form's to resolve, not an option",
    ).to.not.have.property("rowId");
  });

  it("is declared as a block over a table, picked by mode", () => {
    const declared = ListBlockTypes().find(
      (block) => block.type === "ResourceForm",
    );

    expect(declared?.controllerArg).to.equal(true);
    expect(declared?.config.mode?.enum).to.deep.equal(["new", "edit", "view"]);
    expect(declared?.config.fields, "fields come from the table").to.equal(
      undefined,
    );
  });
});
