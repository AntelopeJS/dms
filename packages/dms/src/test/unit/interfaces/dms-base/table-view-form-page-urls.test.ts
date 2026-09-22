// A page is a class carrying only static component fields — that is the shape the decorator consumes.

import { Controller } from "@antelopejs/interface-api";
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
  RegisterPage,
  RootPageController,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as realtimeInterface from "@antelopejs/interface-dms/realtime";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import {
  Column,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view/options";

const TABLE = "form-page-url-documents";
const LOCATION = "/api/form-page-urls";
const BUILDER_URL = "/modules/automation/builder?selected=:id";

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Document extends Table {
  @Field("string") declare name: string;
}

class DocumentModel extends BasicDataModel(Document, TABLE) {}

@RegisterDataController()
class DocumentAPI extends DataController(
  Document,
  { new: TableViewRoutes.New, edit: TableViewRoutes.Edit },
  Controller(LOCATION),
) {
  @ModelReference()
  @Model(DocumentModel)
  declare model: DocumentModel;
  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare name: string;
}

const defaultTable = TableView(DocumentAPI, {
  formContainer: { type: "page" },
  realtime: false,
});

const customTable = TableView(DocumentAPI, {
  formContainer: {
    type: "page",
    pages: {
      new: { urlSlug: "create" },
      edit: { urlSlug: ":id/modify" },
      view: { urlSlug: ":id", customPage: true },
    },
  },
  realtime: false,
});

const absoluteTable = TableView(DocumentAPI, {
  formContainer: {
    type: "page",
    pages: {
      new: { urlSlug: "/modules/automation/builder", customPage: true },
      edit: { urlSlug: BUILDER_URL, customPage: true },
      view: { urlSlug: BUILDER_URL, customPage: true },
    },
  },
  realtime: false,
});

const drawerTable = TableView(DocumentAPI, {
  formContainer: { type: "drawer" },
  realtime: false,
});

const nestedTable = TableView(DocumentAPI, {
  formContainer: { type: "page" },
  realtime: false,
});

@RegisterPage()
class DefaultPage extends RootPageController("fpu-default", {
  displayName: "Default form pages",
}) {
  static table = defaultTable;
}

@RegisterPage()
class CustomPage extends RootPageController("fpu-custom", {
  displayName: "Custom form pages",
}) {
  static table = customTable;
}

@RegisterPage()
class AbsolutePage extends RootPageController("fpu-absolute", {
  displayName: "Absolute form pages",
}) {
  static table = absoluteTable;
}

@RegisterPage()
class DrawerPage extends RootPageController("fpu-drawer", {
  displayName: "Drawer form container",
}) {
  static table = drawerTable;
}

@RegisterPage()
class NestedPage extends RootPageController("fpu-nested", {
  displayName: "Nested table view",
}) {
  static grid = Grid({ gap: "1rem" }).child(
    "row",
    GridRow().child("table", nestedTable),
  );
}

const pages = [DefaultPage, CustomPage, AbsolutePage, DrawerPage, NestedPage];

async function formPages(
  table: typeof defaultTable,
): Promise<TableViewOptionsSerialized["formPages"]> {
  return (await table.serialize()).options?.formPages;
}

describe("[unit] interfaces/dms-base — serialized form page URLs", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(realtimeInterface, realtimeImpl);
    ImplementInterface(pageInterface, pageImpl);
    await settle();
  });

  after(() => {
    for (const page of pages) {
      const { pageInfo } = GetMetadata(page, PageMetadata);
      if (pageInfo) pageInterface.internal.RegisterPage.unregister(pageInfo);
    }
  });

  it("serializes the default slugs, at the URLs the form pages register under", async () => {
    expect(await formPages(defaultTable)).to.deep.equal({
      new: "/fpu-default/new",
      edit: "/fpu-default/:id/edit",
      view: "/fpu-default/:id/view",
    });
    expect(GetPageLayoutBySlug("/fpu-default/new")).to.not.equal(undefined);
    expect(GetPageLayoutBySlug("/fpu-default/:id/edit")).to.not.equal(
      undefined,
    );
  });

  it("resolves a custom relative slug against the page slug", async () => {
    expect(await formPages(customTable)).to.deep.equal({
      new: "/fpu-custom/create",
      edit: "/fpu-custom/:id/modify",
      view: "/fpu-custom/:id",
    });
    expect(GetPageLayoutBySlug("/fpu-custom/create")).to.not.equal(undefined);
  });

  // A `customPage` entry registers nothing — the page is hand-written — but the
  // table view still navigates to its URL.
  it("serializes a customPage entry it registers no page for", async () => {
    expect((await formPages(customTable))?.view).to.equal("/fpu-custom/:id");
    expect(GetPageLayoutBySlug("/fpu-custom/:id")).to.equal(undefined);
  });

  it("keeps an absolute slug verbatim, query string included", async () => {
    expect(await formPages(absoluteTable)).to.deep.equal({
      new: "/modules/automation/builder",
      edit: BUILDER_URL,
      view: BUILDER_URL,
    });
  });

  // The nesting guard skips registration; the frontend navigates all the same,
  // so the URL is serialized as if it had registered.
  it("serializes the URLs of a nested table view, which registers none", async () => {
    expect(await formPages(nestedTable)).to.deep.equal({
      new: "/fpu-nested/new",
      edit: "/fpu-nested/:id/edit",
      view: "/fpu-nested/:id/view",
    });
    expect(GetPageLayoutBySlug("/fpu-nested/new")).to.equal(undefined);
  });

  it("serializes no form page URL when the container is not a page", async () => {
    expect(await formPages(drawerTable)).to.equal(undefined);
  });
});
