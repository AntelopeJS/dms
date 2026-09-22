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
import {
  FormEvents,
  type FormPropsSerialized,
} from "@antelopejs/interface-dms/base/form-types";
import {
  Column,
  TableView,
  TableViewFunctions,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

const TABLE = "form-redirect-documents";
const LOCATION = "/api/form-redirect-placeholders";

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Document extends Table {
  @Field("string") declare name: string;
  @Field("string") declare status: string;
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

const QUERY_FILTER = { status: { field: "status" } };

const pageTable = () =>
  TableView(DocumentAPI, {
    formContainer: { type: "page" },
    queryParamFilters: QUERY_FILTER,
    realtime: false,
  });

@RegisterPage()
class DetailPage extends RootPageController("frd-detail", {
  displayName: "Detail of a workspace",
  urlSlug: "frd-detail/:id",
}) {
  static rows = pageTable();
}

@RegisterPage()
class NamedParamPage extends RootPageController("frd-named", {
  displayName: "Detail with a placeholder of its own name",
  urlSlug: "frd-named/:workspace",
}) {
  static rows = pageTable();
}

@RegisterPage()
class MixedParamPage extends RootPageController("frd-mixed", {
  displayName: "Detail with two distinct placeholders",
  urlSlug: "frd-mixed/:project/members/:id",
}) {
  static rows = pageTable();
}

@RegisterPage()
class DeepPage extends RootPageController("frd-deep", {
  displayName: "Page repeating its own placeholder",
  urlSlug: "frd-deep/:id/sub/:id",
}) {
  static rows = pageTable();
}

@RegisterPage()
class TopLevelPage extends RootPageController("frd-top", {
  displayName: "Page without a route parameter",
}) {
  static rows = pageTable();
}

@RegisterPage()
class UnfilteredPage extends RootPageController("frd-unfiltered", {
  displayName: "Table view without URL filters",
  urlSlug: "frd-unfiltered/static/slug",
}) {
  static rows = TableView(DocumentAPI, {
    formContainer: { type: "page" },
    realtime: false,
  });
}

const pages = [
  DetailPage,
  NamedParamPage,
  MixedParamPage,
  DeepPage,
  TopLevelPage,
  UnfilteredPage,
];

async function formRedirects(
  formPageFullId: string,
): Promise<Record<string, unknown>[]> {
  const form = pageMetadataByFullId.get(formPageFullId)?.components.form;
  if (!form) throw new Error(`No form page registered as ${formPageFullId}`);
  const options = (await form.serialize()).options as
    | FormPropsSerialized
    | undefined;
  return (options?.watchActions ?? [])
    .filter(
      (watch) =>
        watch.event === FormEvents.SUBMIT_SUCCESS &&
        watch.functionId === TableViewFunctions.CUSTOM_PAGE_FORM_SUCCESS,
    )
    .map((watch) => watch.params ?? {});
}

async function redirectOf(
  formPageFullId: string,
): Promise<Record<string, unknown>> {
  const redirects = await formRedirects(formPageFullId);
  expect(redirects).to.have.length(1);
  return redirects[0]!;
}

describe("[unit] interfaces/dms-base — table view form page redirect", () => {
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

  // `/frd-detail/:id/rows/:id/edit`: the bare name is the row id, the page's
  // is the first occurrence.
  it("numbers the page parameter on an edit route repeating its name", async () => {
    expect(await redirectOf("frd-detail.rows.edit")).to.deep.equal({
      url: "/frd-detail/{{params.id:1}}",
      preserveQuery: ["status"],
    });
  });

  // `/frd-detail/:id/rows/new` carries one `:id`, which has no numbered key.
  it("keeps the bare name on a new route carrying the name once", async () => {
    expect(await redirectOf("frd-detail.rows.new")).to.deep.equal({
      url: "/frd-detail/{{params.id}}",
      preserveQuery: ["status"],
    });
  });

  it("does not redirect from the view form", async () => {
    expect(await formRedirects("frd-detail.rows.view")).to.deep.equal([]);
  });

  it("keeps the bare name of a placeholder the form route does not repeat", async () => {
    for (const kind of ["new", "edit"]) {
      expect((await redirectOf(`frd-named.rows.${kind}`)).url).to.equal(
        "/frd-named/{{params.workspace}}",
      );
    }
    expect((await redirectOf("frd-mixed.rows.new")).url).to.equal(
      "/frd-mixed/{{params.project}}/members/{{params.id}}",
    );
    expect((await redirectOf("frd-mixed.rows.edit")).url).to.equal(
      "/frd-mixed/{{params.project}}/members/{{params.id:1}}",
    );
  });

  it("numbers every occurrence of a name the page slug repeats", async () => {
    for (const kind of ["new", "edit"]) {
      expect((await redirectOf(`frd-deep.rows.${kind}`)).url).to.equal(
        "/frd-deep/{{params.id:1}}/sub/{{params.id:2}}",
      );
    }
  });

  it("redirects to the slug of a page without route parameter as is", async () => {
    for (const page of [TopLevelPage, UnfilteredPage]) {
      const { pageInfo } = GetMetadata(page, PageMetadata);
      for (const kind of ["new", "edit"]) {
        const redirect = await redirectOf(`${pageInfo!.id}.rows.${kind}`);
        expect(redirect.url).to.equal(pageInfo!.fullSlug);
      }
    }
    expect(await redirectOf("frd-top.rows.edit")).to.deep.equal({
      url: "/frd-top",
      preserveQuery: ["status"],
    });
    expect(await redirectOf("frd-unfiltered.rows.new")).to.deep.equal({
      url: "/frd-unfiltered/static/slug",
    });
  });
});
