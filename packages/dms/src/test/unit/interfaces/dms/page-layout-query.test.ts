import type {
  ControllerClass,
  RequestContext,
} from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  buildPagePayload,
  pageParamsOf,
  internal as pageImplInternal,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import type { PageHeaderButtonSerialized } from "@antelopejs/interface-dms/base/internal/layouts";
import {
  GetPageLayoutBySlug,
  PageController,
  PageMetadata,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import { readRequestQuery } from "@antelopejs/interface-dms/page/internal/metadata-helpers";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const TENANT = "layout-query-tenant";
// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Layout permission lookup reads only the id; this fixture deliberately omits unrelated user columns.
const MEMBER = { _id: "layout-query-member" } as User;
const models = stubPageAccessModels(["*"]);
// SAFETY: buildPagePayload reads the request's url, and tenant resolution reads the optional rawRequest, whose absence falls back to the default tenant; the double supplies the url only.
const requestAt = (url: URL) => ({ url }) as RequestContext;
// SAFETY: Every suite here installs DefaultLayout on its page, so the options are DefaultLayout's serialized options, of which ServedOptions describes only the headerActions the tests read.
const headerOptions = (layout: { options?: unknown } | undefined) =>
  layout?.options as ServedOptions;

interface ServedOptions {
  headerActions: PageHeaderButtonSerialized[];
  headerActionsQuery?: Record<string, string>;
  headerActionsParams?: Record<string, string>;
  recordStatus?: string;
}

/**
 * A header button's availability reads the query of the page URL: a language
 * page enables "Download" only for a language the workspace in `?workspace=`
 * has. The layout says which query it was served for.
 */
describe("[unit] interfaces/dms/page — header availability reads the page query", () => {
  const cleanups: Array<() => void> = [];
  let slug = "";

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    const controller: ControllerClass = PageController(
      "lq-language",
      { displayName: "Language", category: pagesCategory },
      DefaultLayout({
        headerActions: [
          {
            id: "download",
            label: "Download",
            target: { type: "page", url: "/download?locale={{query.locale}}" },
            availability: ({ query }) =>
              query?.workspace === "web"
                ? undefined
                : { reason: "$lang.unknown_workspace" },
          },
          {
            id: "add-language",
            label: "Add language",
            target: { type: "page", url: "/languages/new" },
            availability: ({ query }) =>
              query?.workspace === "locked" ? { hidden: true } : undefined,
          },
        ],
      }),
    );
    cleanups.push(await registerTestPage(controller));
    slug = GetMetadata(controller, PageMetadata).pageInfo?.fullSlug ?? "";
  });

  after(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  async function serve(query?: Record<string, string>) {
    const handler = GetPageLayoutBySlug(slug);
    if (!handler) throw new Error(`no layout handler for ${slug}`);
    const layout = await handler({
      user: MEMBER,
      memberModel: models.memberModel,
      roleModel: models.roleModel,
      tenantId: TENANT,
      query,
    });
    return headerOptions(layout.layout);
  }

  it("enables the button for the query its availability accepts", async () => {
    const options = await serve({ workspace: "web" });
    expect(options.headerActions[0]).to.not.have.property("disabled");
    expect(options.headerActionsQuery).to.deep.equal({ workspace: "web" });
    expect(options).to.not.have.property("recordStatus");
  });

  it("disables it for another query, and without one", async () => {
    expect(
      (await serve({ workspace: "gone" })).headerActions[0],
    ).to.deep.include({
      disabled: true,
      disabledReason: "$lang.unknown_workspace",
    });
    const bare = await serve();
    expect(bare.headerActions[0]).to.deep.include({ disabled: true });
    expect(bare.headerActionsQuery).to.deep.equal({});
  });

  it("leaves out the button its availability hides for the query", async () => {
    const ids = (options: ServedOptions) =>
      options.headerActions.map((action) => action.id);
    const locked = await serve({ workspace: "locked" });
    expect(ids(locked)).to.deep.equal(["download"]);
    expect(locked.headerActionsQuery).to.deep.equal({ workspace: "locked" });
    expect(ids(await serve({ workspace: "web" }))).to.deep.equal([
      "download",
      "add-language",
    ]);
  });

  it("resolves the page request's buttons with the page query it carries", async () => {
    const pageRequest = (query: string) =>
      requestAt(
        new URL(
          `http://dms.test/dms/page?path=${encodeURIComponent(slug)}&shared=false${query}`,
        ),
      );
    const served = async (query: string) =>
      headerOptions(
        (
          await buildPagePayload(
            slug,
            MEMBER,
            models.memberModel,
            models.roleModel,
            TENANT,
            false,
            pageRequest(query),
          )
        ).layout.layout,
      );

    const withQuery = await served("&workspace=web");
    expect(withQuery.headerActions[0]).to.not.have.property("disabled");
    expect(withQuery.headerActionsQuery).to.deep.equal({ workspace: "web" });
    const bare = await served("");
    expect(bare.headerActions[0]).to.deep.include({ disabled: true });
    expect(bare.headerActionsQuery).to.deep.equal({});
  });

  it("reads one value per name from the layout request", () => {
    expect(
      readRequestQuery({
        url: new URL("http://dms.test/p/pagelayout?workspace=web&tag=a&tag=b"),
      }),
    ).to.deep.equal({ workspace: "web", tag: "b" });
  });
});

/**
 * A detail page reads its record from a route parameter, not the query: its
 * header buttons hide themselves when `/:id` names no record.
 */
describe("[unit] interfaces/dms/page — header availability reads the route parameters", () => {
  const cleanups: Array<() => void> = [];
  let pattern = "";

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    const controller: ControllerClass = PageController(
      "lq-project",
      {
        displayName: "Project",
        category: pagesCategory,
        urlSlug: "lq-projects/:id",
        hidden: true,
      },
      DefaultLayout({
        headerActions: [
          {
            id: "edit",
            label: "Edit",
            target: { type: "page", url: "/edit" },
            availability: ({ params }) =>
              params?.id === "p1" ? undefined : { hidden: true },
          },
        ],
      }),
    );
    cleanups.push(await registerTestPage(controller));
    pattern = GetMetadata(controller, PageMetadata).pageInfo?.fullSlug ?? "";
  });

  after(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  async function served(id: string) {
    const path = pattern.replace(":id", id);
    const payload = await buildPagePayload(
      path,
      MEMBER,
      models.memberModel,
      models.roleModel,
      TENANT,
      false,
      requestAt(new URL(`http://dms.test/dms/page?path=${path}&shared=false`)),
    );
    return headerOptions(payload.layout.layout);
  }

  it("serves the button for an existing record, and says which one", async () => {
    const options = await served("p1");
    expect(options.headerActions.map((action) => action.id)).to.deep.equal([
      "edit",
    ]);
    expect(options.headerActionsParams).to.deep.equal({ id: "p1" });
  });

  it("leaves it out for a record that does not exist", async () => {
    const options = await served("missing");
    expect(options.headerActions).to.deep.equal([]);
    expect(options.headerActionsParams).to.deep.equal({ id: "missing" });
  });

  it("reads a path's parameters against the page's pattern", () => {
    expect(pageParamsOf("/a/:id/b", "/a/p1/b")).to.deep.equal({ id: "p1" });
    expect(pageParamsOf("/a/:id/b", "/a/p1/c")).to.deep.equal({});
  });
});

/**
 * A detail page reads its record with its layout (`DefaultLayout({ record })`):
 * the header buttons acting on it take its fields as `{{record.X}}`, or are
 * left out without it, and every availability of the page reads it.
 */
describe("[unit] interfaces/dms/page — the page's record, read with its layout", () => {
  const cleanups: Array<() => void> = [];
  type SiteRecord = {
    address: string;
    owner?: { id: string };
    locked?: boolean;
  };
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- The concrete SiteRecord fixture is indexed by arbitrary route ids, including missing ids; its lookup must retain the existing undefined result without adding runtime key validation.
  const SITES: Record<string, SiteRecord> = {
    s1: { address: "1 rue de l'Église, Liège", owner: { id: "u&1" } },
    locked: { address: "Gare", locked: true },
  };
  let pattern = "";
  let notePattern = "";

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    const controller: ControllerClass = PageController(
      "lq-site",
      {
        displayName: "Site",
        category: pagesCategory,
        urlSlug: "lq-sites/:id",
        hidden: true,
      },
      DefaultLayout({
        record: ({ params }) => {
          if (params?.id === "broken") throw new Error("database down");
          return SITES[params?.id ?? ""];
        },
        headerActions: [
          {
            id: "directions",
            label: "Directions",
            target: {
              type: "external",
              url: "https://maps.example.com/?q={{record.address}}&o={{record.owner.id}}&x={{record.none}}",
            },
          },
          {
            id: "edit",
            label: "Edit",
            requiresRecord: true,
            target: { type: "page", url: "/lq-sites/{{params.id}}/edit" },
          },
          {
            id: "delete",
            label: "Delete",
            target: { type: "page", url: "/delete" },
            availability: ({ record }) =>
              record?.locked ? { reason: "$sites.locked" } : undefined,
          },
          { id: "help", label: "Help", target: { type: "page", url: "/help" } },
        ],
      }),
    );
    cleanups.push(await registerTestPage(controller));
    pattern = GetMetadata(controller, PageMetadata).pageInfo?.fullSlug ?? "";

    const note: ControllerClass = PageController(
      "lq-note",
      {
        displayName: "Note",
        category: pagesCategory,
        urlSlug: "lq-notes/:id",
        hidden: true,
      },
      DefaultLayout({ record: ({ params }) => SITES[params?.id ?? ""] }),
    );
    cleanups.push(await registerTestPage(note));
    notePattern = GetMetadata(note, PageMetadata).pageInfo?.fullSlug ?? "";
  });

  after(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  async function served(id: string, slug = pattern) {
    const path = slug.replace(":id", id);
    const payload = await buildPagePayload(
      path,
      MEMBER,
      models.memberModel,
      models.roleModel,
      TENANT,
      false,
      requestAt(new URL(`http://dms.test/dms/page?path=${path}&shared=false`)),
    );
    return headerOptions(payload.layout.layout);
  }

  const byId = (options: ServedOptions, id: string) =>
    options.headerActions.find((action) => action.id === id);

  it("fills the buttons acting on the record with its fields, encoded", async () => {
    const options = await served("s1");
    expect(options.headerActions.map((action) => action.id)).to.deep.equal([
      "directions",
      "edit",
      "delete",
      "help",
    ]);
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The action target owner is a union including drawers; this fixture's directions action is the external URL declared above.
    const directions = byId(options, "directions")?.target as
      | Extract<PageHeaderButtonSerialized["target"], { url: string }>
      | undefined;
    expect(directions?.url).to.equal(
      `https://maps.example.com/?q=${encodeURIComponent("1 rue de l'Église, Liège")}&o=u%261&x={{record.none}}`,
    );
    expect(byId(options, "edit")).to.not.have.property("requiresRecord");
    expect(options).to.not.have.property("record");
    expect(options.headerActionsParams).to.deep.equal({ id: "s1" });
  });

  it("hands the record to every availability of the page", async () => {
    const options = await served("locked");
    expect(byId(options, "delete")).to.include({
      disabled: true,
      disabledReason: "$sites.locked",
    });
    expect(byId(await served("s1"), "delete")).to.not.have.property("disabled");
  });

  it("leaves the buttons acting on the record out when there is none", async () => {
    for (const id of ["missing", "broken"]) {
      const options = await served(id);
      expect(options.headerActions.map((action) => action.id)).to.deep.equal([
        "delete",
        "help",
      ]);
      expect(options.headerActionsParams).to.deep.equal({ id });
    }
  });

  it("says whether it found the record, found none, or failed to read it", async () => {
    expect((await served("s1")).recordStatus).to.equal("found");
    expect((await served("missing")).recordStatus).to.equal("missing");
    expect((await served("broken")).recordStatus).to.equal("error");
  });

  it("says it on a page without header buttons too, with the URL it read", async () => {
    const options = await served("gone", notePattern);
    expect(options).to.include({ recordStatus: "missing" });
    expect(options.headerActionsParams).to.deep.equal({ id: "gone" });
    expect(options).to.not.have.property("headerActions");
  });
});
