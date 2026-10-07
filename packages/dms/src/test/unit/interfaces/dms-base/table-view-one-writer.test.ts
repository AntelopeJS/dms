// A page is a class carrying only static component fields — that is the shape the decorator consumes.

import { Controller, type ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
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
import * as pageImpl from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as realtimeImpl from "../../../../implementations/dms/realtime";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import * as pageInterface from "@antelopejs/interface-dms/page";
import {
  GetPageLayoutBySlug,
  PageMetadata,
  RootPageController,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as realtimeInterface from "@antelopejs/interface-dms/realtime";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import {
  Column,
  TableView,
  TableViewMeta,
  TableViewRoutes,
  WritingTableViewConflictError,
} from "@antelopejs/interface-dms/base/table-view";
import type { Component } from "@antelopejs/interface-dms/component";
import { derivedController } from "../../../helpers/derived-controller";

// A data controller has one writing TableView: a second one fails its page's
// registration, read-only ones share the controller, and a derived controller
// is how the same data gets a second writing screen.

const TABLE = "one-writer-documents";
const LOCATION = "/api/one-writer-documents";
const READ_ONLY = {
  add: false,
  duplicate: false,
  edit: false,
  delete: false,
} as const;

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Document extends Table {
  @Field("string") declare name: string;
}

class DocumentModel extends BasicDataModel(Document, TABLE) {}

@RegisterDataController()
class DocumentAPI extends DataController(
  Document,
  {
    new: TableViewRoutes.New,
    edit: TableViewRoutes.Edit,
    delete: TableViewRoutes.Delete,
  },
  Controller(LOCATION),
) {
  @ModelReference()
  @Model(DocumentModel)
  declare model: DocumentModel;
  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare name: string;
}

const registered: PageMetadata[] = [];

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Register a page carrying `components`; the error it fails with, if any. */
async function registerPage(
  id: string,
  components: Record<string, Component>,
): Promise<Error | undefined> {
  class SomePage extends RootPageController(id, { displayName: id }) {}
  const meta = GetMetadata(SomePage as ControllerClass, PageMetadata);
  for (const [key, component] of Object.entries(components)) {
    meta.SetComponent(key, component);
  }
  registered.push(meta);
  return meta.Register().then(
    () => undefined,
    (error: unknown) => error as Error,
  );
}

describe("[unit] interfaces/dms-base — one writing TableView per data controller", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(realtimeInterface, realtimeImpl);
    ImplementInterface(pageInterface, pageImpl);
    expect(
      await registerPage("ow-writer", {
        table: TableView(DocumentAPI, { realtime: false }),
      }),
    ).to.equal(undefined);
    await settle();
  });

  after(() => {
    for (const meta of registered) meta.Dispose();
  });

  it("fails the page of a second writing TableView over the controller", async () => {
    const failure = await registerPage("ow-second", {
      table: TableView(DocumentAPI, {
        realtime: false,
        rowActions: { ...READ_ONLY, delete: true },
      }),
    });

    expect(failure).to.be.instanceOf(WritingTableViewConflictError);
    expect(failure?.message).to.contain(
      'TableView "ow-writer.table" (page "ow-writer") and TableView "ow-second.table" (page "ow-second") both write through the data controller DocumentAPI',
    );
    expect(failure?.message).to.contain(
      "Show the same data in two writing screens: derive the controller",
    );
    expect(GetPageLayoutBySlug("/ow-second")).to.equal(undefined);
  });

  it("fails it as well when the TableView sits inside another component", async () => {
    const failure = await registerPage("ow-nested", {
      grid: Grid({ gap: "1rem" }).child(
        "row",
        GridRow().child("table", TableView(DocumentAPI, { realtime: false })),
      ),
    });

    expect(failure).to.be.instanceOf(WritingTableViewConflictError);
    expect(GetPageLayoutBySlug("/ow-nested")).to.equal(undefined);
  });

  it("fails two writing TableViews of one page", async () => {
    const SiblingAPI = derivedController(
      Document,
      DocumentAPI,
      `${LOCATION}-siblings`,
    );
    const failure = await registerPage("ow-siblings", {
      first: TableView(SiblingAPI, { realtime: false }),
      second: TableView(SiblingAPI, { realtime: false }),
    });

    expect(failure).to.be.instanceOf(WritingTableViewConflictError);
    expect(failure?.message).to.contain(
      'TableView "ow-siblings.first" (page "ow-siblings") and TableView "ow-siblings.second" (page "ow-siblings")',
    );
  });

  it("lets read-only TableViews share the controller", async () => {
    const reader = TableView(DocumentAPI, {
      realtime: false,
      rowActions: READ_ONLY,
    });
    expect(await registerPage("ow-reader", { table: reader })).to.equal(
      undefined,
    );
    expect(GetPageLayoutBySlug("/ow-reader")).to.not.equal(undefined);
    expect(
      GetMetadata(DocumentAPI, TableViewMeta).writingComponentBuilders,
    ).to.not.include(reader);
  });

  it("lets the writing TableView's page register again, as a hot reload does", async () => {
    expect(
      await registerPage("ow-writer", {
        table: TableView(DocumentAPI, { realtime: false }),
      }),
    ).to.equal(undefined);
  });

  it("gives the same data a second writing screen through a derived controller", async () => {
    const DerivedAPI = derivedController(
      Document,
      DocumentAPI,
      `${LOCATION}-derived`,
    );
    expect(
      await registerPage("ow-derived", {
        table: TableView(DerivedAPI, { realtime: false }),
      }),
    ).to.equal(undefined);
    expect(GetPageLayoutBySlug("/ow-derived")).to.not.equal(undefined);
  });
});
