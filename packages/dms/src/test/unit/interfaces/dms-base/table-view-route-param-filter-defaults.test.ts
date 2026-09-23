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
  PageMetadata,
  RegisterPage,
  RootPageController,
} from "@antelopejs/interface-dms/page";
import { pageMetadataByFullId } from "@antelopejs/interface-dms/page/registry";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as realtimeInterface from "@antelopejs/interface-dms/realtime";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import type { FormPropsSerialized } from "@antelopejs/interface-dms/base/form-types";
import {
  Column,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view/options";

const TABLE = "route-param-filter-documents";
const LOCATION = "/api/route-param-filter-defaults";

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// `_instance` is filtered on but never a column: nothing the user fills in
// overrides the default the form submits for it.
@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Document extends Table {
  @Field("string") declare name: string;
  @Field("string") declare _instance: string;
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

const ROUTE_FILTER = { id: { field: "_instance" } };
const QUERY_FILTER = { status: { field: "status" } };

const detailTable = TableView(DocumentAPI, {
  formContainer: { type: "page" },
  routeParamFilters: ROUTE_FILTER,
  queryParamFilters: QUERY_FILTER,
  realtime: false,
});

const namedParamTable = TableView(DocumentAPI, {
  formContainer: { type: "page" },
  routeParamFilters: { workspace: { field: "_instance" } },
  realtime: false,
});

const deepTable = TableView(DocumentAPI, {
  formContainer: { type: "page" },
  routeParamFilters: ROUTE_FILTER,
  realtime: false,
});

const topLevelTable = TableView(DocumentAPI, {
  formContainer: { type: "page" },
  routeParamFilters: ROUTE_FILTER,
  realtime: false,
});

const unfilteredTable = TableView(DocumentAPI, {
  formContainer: { type: "page" },
  realtime: false,
});

const drawerTable = TableView(DocumentAPI, {
  formContainer: { type: "drawer" },
  routeParamFilters: ROUTE_FILTER,
  realtime: false,
});

@RegisterPage()
class DetailPage extends RootPageController("rpf-detail", {
  displayName: "Detail of a workspace",
  urlSlug: "rpf-detail/:id",
}) {
  static rows = detailTable;
}

@RegisterPage()
class NamedParamPage extends RootPageController("rpf-named", {
  displayName: "Detail with a placeholder of its own name",
  urlSlug: "rpf-named/:workspace",
}) {
  static rows = namedParamTable;
}

// The page slug already repeats `:id`: the bare name the table view filters on
// is its last occurrence, the second.
@RegisterPage()
class DeepPage extends RootPageController("rpf-deep", {
  displayName: "Page repeating its own placeholder",
  urlSlug: "rpf-deep/:id/sub/:id",
}) {
  static rows = deepTable;
}

@RegisterPage()
class TopLevelPage extends RootPageController("rpf-top", {
  displayName: "Page without a route parameter",
}) {
  static rows = topLevelTable;
}

@RegisterPage()
class UnfilteredPage extends RootPageController("rpf-unfiltered", {
  displayName: "Table view without URL filters",
}) {
  static rows = unfilteredTable;
}

@RegisterPage()
class DrawerPage extends RootPageController("rpf-drawer", {
  displayName: "Drawer form container",
  urlSlug: "rpf-drawer/:id",
}) {
  static rows = drawerTable;
}

const pages = [
  DetailPage,
  NamedParamPage,
  DeepPage,
  TopLevelPage,
  UnfilteredPage,
  DrawerPage,
];

async function formPageOptions(
  formPageFullId: string,
): Promise<FormPropsSerialized | undefined> {
  const form = pageMetadataByFullId.get(formPageFullId)?.components.form;
  if (!form) throw new Error(`No form page registered as ${formPageFullId}`);
  return (await form.serialize()).options as FormPropsSerialized | undefined;
}

async function formComponents(
  table: typeof detailTable,
): Promise<TableViewOptionsSerialized["formComponents"] | undefined> {
  return (await table.serialize()).options?.formComponents;
}

describe("[unit] interfaces/dms-base — route param filter form defaults", () => {
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

  // `/rpf-detail/:id/rows/:id/edit`: the bare name is the row id, which the
  // submit URL wants; the filtered field wants the page's, the first.
  it("numbers the page parameter on an edit route repeating its name", async () => {
    const edit = await formPageOptions("rpf-detail.rows.edit");
    expect(edit?.submitDefaults).to.deep.equal({
      status: "{{query.status}}",
      _instance: "{{params.id:1}}",
    });
    expect(edit?.submitUrl).to.equal(`${LOCATION}/edit?id={{params.id}}`);
  });

  // `/rpf-detail/:id/rows/new` carries one `:id`, which has no numbered key.
  it("keeps the bare name on a new route carrying the name once", async () => {
    expect(
      (await formPageOptions("rpf-detail.rows.new"))?.submitDefaults,
    ).to.deep.equal({
      status: "{{query.status}}",
      _instance: "{{params.id}}",
    });
  });

  it("gives the view form no defaults", async () => {
    expect(
      (await formPageOptions("rpf-detail.rows.view"))?.submitDefaults,
    ).to.equal(undefined);
  });

  it("keeps the bare name when the page parameter is not named id", async () => {
    expect(
      (await formPageOptions("rpf-named.rows.edit"))?.submitDefaults,
    ).to.deep.equal({ _instance: "{{params.workspace}}" });
  });

  it("numbers the last occurrence of a name the page slug repeats", async () => {
    expect(
      (await formPageOptions("rpf-deep.rows.new"))?.submitDefaults,
    ).to.deep.equal({ _instance: "{{params.id:2}}" });
    expect(
      (await formPageOptions("rpf-deep.rows.edit"))?.submitDefaults,
    ).to.deep.equal({ _instance: "{{params.id:2}}" });
  });

  it("leaves the forms of a page without route parameter as they were", async () => {
    for (const kind of ["new", "edit"]) {
      expect(
        (await formPageOptions(`rpf-top.rows.${kind}`))?.submitDefaults,
      ).to.deep.equal({ _instance: "{{params.id}}" });
    }
    const unfiltered = await formPageOptions("rpf-unfiltered.rows.edit");
    expect(unfiltered?.submitDefaults).to.equal(undefined);
  });

  // Embedded in the table view, a form renders on the page carrying it, where
  // the bare name is the parameter the table filters on.
  it("keeps the bare name on the forms the table view embeds", async () => {
    const embedded = await formComponents(drawerTable);
    expect(embedded?.edit?.options?.submitDefaults).to.deep.equal({
      _instance: "{{params.id}}",
    });
    expect(
      (await formComponents(detailTable))?.edit?.options?.submitDefaults,
    ).to.deep.equal({
      status: "{{query.status}}",
      _instance: "{{params.id}}",
    });
  });
});
