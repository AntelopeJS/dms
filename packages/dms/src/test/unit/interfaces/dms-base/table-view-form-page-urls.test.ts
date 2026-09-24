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

const firstSiblingTable = TableView(DocumentAPI, {
  formContainer: { type: "page" },
  realtime: false,
});

const secondSiblingTable = TableView(DocumentAPI, {
  formContainer: { type: "page" },
  realtime: false,
});

const detailTable = TableView(DocumentAPI, {
  formContainer: { type: "page" },
  realtime: false,
});

const customPermissionTable = TableView(DocumentAPI, {
  formContainer: { type: "page" },
  realtime: false,
});

const customPermissionDrawerTable = TableView(DocumentAPI, {
  formContainer: { type: "drawer" },
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

@RegisterPage()
class SiblingsPage extends RootPageController("fpu-siblings", {
  displayName: "Two table views",
}) {
  static first = firstSiblingTable;
  static second = secondSiblingTable;
}

// The page's own slug ends in `:id`, so its form pages carry two of them.
@RegisterPage()
class DetailPage extends RootPageController("fpu-detail", {
  displayName: "Detail of a row",
  urlSlug: "fpu-detail/:id",
}) {
  static rows = detailTable;
}

// Its components descend from `fpu.custom-permission`, not from its `fullId`.
@RegisterPage()
class CustomPermissionPage extends RootPageController("fpu-permission", {
  displayName: "Custom page permission",
  permission: { id: "fpu.custom-permission" },
}) {
  static table = customPermissionTable;
}

@RegisterPage()
class CustomPermissionDrawerPage extends RootPageController(
  "fpu-permission-drawer",
  {
    displayName: "Custom page permission, drawer forms",
    permission: { id: "fpu.custom-permission-drawer" },
  },
) {
  static table = customPermissionDrawerTable;
}

const pages = [
  DefaultPage,
  CustomPage,
  AbsolutePage,
  DrawerPage,
  NestedPage,
  SiblingsPage,
  DetailPage,
  CustomPermissionPage,
  CustomPermissionDrawerPage,
];

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

  // The key of the table view among the components of its page names the form
  // routes, so a second table view on the same page gets URLs of its own.
  it("serializes the default slugs under the key of the table view", async () => {
    expect(await formPages(defaultTable)).to.deep.equal({
      new: "/fpu-default/table/new",
      edit: "/fpu-default/table/:id/edit",
      view: "/fpu-default/table/:id/view",
    });
    expect(GetPageLayoutBySlug("/fpu-default/table/new")).to.not.equal(
      undefined,
    );
    expect(GetPageLayoutBySlug("/fpu-default/table/:id/edit")).to.not.equal(
      undefined,
    );
  });

  // A declared slug is full control: it stays relative to the page, with no key
  // segment inserted, so every existing declaration keeps its URL.
  it("resolves a custom relative slug against the page slug, key-free", async () => {
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

  // Its simple key, not the path of components leading to it: the URL stays
  // readable and survives the layout being reorganised around the table view.
  it("names a nested table view after its own key, and registers its pages", async () => {
    expect(await formPages(nestedTable)).to.deep.equal({
      new: "/fpu-nested/table/new",
      edit: "/fpu-nested/table/:id/edit",
      view: "/fpu-nested/table/:id/view",
    });
    expect(GetPageLayoutBySlug("/fpu-nested/table/new")).to.not.equal(
      undefined,
    );
  });

  it("registers both table views of a page, at URLs of their own", async () => {
    expect(await formPages(firstSiblingTable)).to.deep.equal({
      new: "/fpu-siblings/first/new",
      edit: "/fpu-siblings/first/:id/edit",
      view: "/fpu-siblings/first/:id/view",
    });
    expect(await formPages(secondSiblingTable)).to.deep.equal({
      new: "/fpu-siblings/second/new",
      edit: "/fpu-siblings/second/:id/edit",
      view: "/fpu-siblings/second/:id/view",
    });
    expect(GetPageLayoutBySlug("/fpu-siblings/first/new")).to.not.equal(
      undefined,
    );
    expect(GetPageLayoutBySlug("/fpu-siblings/second/new")).to.not.equal(
      undefined,
    );
  });

  // Two `:id` in one route: the page contributes the first, the form the
  // second. `fillFormPageUrl` tells them apart, and the page registry matches
  // a pattern segment by segment, so the duplicate name costs nothing.
  it("registers a form page below a page whose own slug is :id", async () => {
    expect(await formPages(detailTable)).to.deep.equal({
      new: "/fpu-detail/:id/rows/new",
      edit: "/fpu-detail/:id/rows/:id/edit",
      view: "/fpu-detail/:id/rows/:id/view",
    });
    expect(GetPageLayoutBySlug("/fpu-detail/:id/rows/:id/view")).to.not.equal(
      undefined,
    );
  });

  // `@RegisterPage` fires and forgets, so the rejection is taken here the way
  // the teardown suite takes a component that fails to serialize.
  it("fails the registration of two table views claiming one form URL", async () => {
    const clashingPages = { new: { urlSlug: "clash" } };
    const first = TableView(DocumentAPI, {
      formContainer: { type: "page", pages: clashingPages },
      realtime: false,
    });
    const second = TableView(DocumentAPI, {
      formContainer: { type: "page", pages: clashingPages },
      realtime: false,
    });

    class ClashingPage extends RootPageController("fpu-clash", {
      displayName: "Clashing table views",
    }) {}
    const meta = GetMetadata(ClashingPage as ControllerClass, PageMetadata);
    meta.SetComponent("first", first);
    meta.SetComponent("second", second);

    const failure = await meta.Register().then(
      () => undefined,
      (error: unknown) => error as Error,
    );

    expect(failure?.message ?? "").to.match(
      /TableView "fpu-clash\.first" and TableView "fpu-clash\.second"/,
    );
    expect(failure?.message ?? "").to.contain('at "/fpu-clash/clash"');
    expect(GetPageLayoutBySlug("/fpu-clash")).to.equal(undefined);
  });

  it("names the form routes of a page with a custom permission id after the table view", async () => {
    expect(
      GetMetadata(CustomPermissionPage, PageMetadata).ComponentPermissionIds(
        customPermissionTable,
      ),
    ).to.deep.equal(["fpu.custom-permission.table"]);
    expect(await formPages(customPermissionTable)).to.deep.equal({
      new: "/fpu-permission/table/new",
      edit: "/fpu-permission/table/:id/edit",
      view: "/fpu-permission/table/:id/view",
    });
    expect(GetPageLayoutBySlug("/fpu-permission/table/new")).to.not.equal(
      undefined,
    );
  });

  it("registers a page with a custom permission id and drawer forms", async () => {
    expect(await formPages(customPermissionDrawerTable)).to.equal(undefined);
    expect(GetPageLayoutBySlug("/fpu-permission-drawer")).to.not.equal(
      undefined,
    );
  });

  // The first page to mount the table view owns its permission id, so on the
  // second one it names no component and its form routes have no key.
  it("fails the registration of a page mounting a table view owned by another", async () => {
    class BorrowingPage extends RootPageController("fpu-borrowing", {
      displayName: "Borrowed table view",
    }) {}
    const meta = GetMetadata(BorrowingPage as ControllerClass, PageMetadata);
    meta.SetComponent("table", defaultTable);

    const failure = await meta.Register().then(
      () => undefined,
      (error: unknown) => error as Error,
    );

    expect(failure?.message ?? "").to.contain(
      'TableView permission id "fpu-default.table" names no component',
    );
    expect(GetPageLayoutBySlug("/fpu-borrowing")).to.equal(undefined);
  });

  it("serializes no form page URL when the container is not a page", async () => {
    expect(await formPages(drawerTable)).to.equal(undefined);
  });
});
