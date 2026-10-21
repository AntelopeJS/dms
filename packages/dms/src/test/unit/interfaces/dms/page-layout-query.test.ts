import type {
  ControllerClass,
  RequestContext,
} from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  buildPagePayload,
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
const MEMBER = { _id: "layout-query-member" } as User;
const models = stubPageAccessModels(["*"]);

interface ServedOptions {
  headerActions: PageHeaderButtonSerialized[];
  headerActionsQuery?: Record<string, string>;
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
    const layout = await handler(
      MEMBER,
      models.memberModel,
      models.roleModel,
      TENANT,
      { query },
    );
    return layout.layout?.options as ServedOptions;
  }

  it("enables the button for the query its availability accepts", async () => {
    const options = await serve({ workspace: "web" });
    expect(options.headerActions[0]).to.not.have.property("disabled");
    expect(options.headerActionsQuery).to.deep.equal({ workspace: "web" });
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
      ({
        url: new URL(
          `http://dms.test/dms/page?path=${encodeURIComponent(slug)}&shared=false${query}`,
        ),
      }) as RequestContext;
    const served = async (query: string) =>
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
      ).layout.layout?.options as ServedOptions;

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
