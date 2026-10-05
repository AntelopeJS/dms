import type {
  ControllerClass,
  RequestContext,
} from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  buildSiteLayoutPayload,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import type {
  ComponentBuilder,
  NavBadgeSource,
} from "@antelopejs/interface-dms/component";
import {
  PageController,
  PageMetadata,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { Section } from "@antelopejs/interface-dms/base/section";
import {
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const TENANT = "nb-tenant";
const USER = { _id: "nb-member" } as User;
const REQUEST = {
  url: new URL("http://localhost/dms/sitelayout"),
} as RequestContext;

const counting = (count: number): NavBadgeSource => ({
  count: async () => count,
});

function publishing(
  name: string,
  ...sources: NavBadgeSource[]
): ComponentBuilder<unknown> {
  const component = CustomComponent(name).meta({ name });
  for (const source of sources) component.navBadge(source);
  return component as ComponentBuilder<unknown>;
}

class PageNbMembers extends PageController("nb-members", {
  displayName: "Members",
  category: pagesCategory,
}) {
  static table = publishing("NbMembersTable", counting(7));
}

class PageNbInvites extends PageController("nb-invites", {
  displayName: "Invitations",
  category: pagesCategory,
}) {
  static section = Section().child(
    "table",
    publishing("NbInvitesTable", counting(0), {
      page: PageNbMembers,
      count: async () => 9,
    }),
  );
}

class PageNbFailing extends PageController("nb-failing", {
  displayName: "Failing",
  category: pagesCategory,
}) {
  static table = publishing("NbFailingTable", {
    count: async () => {
      throw new Error("403");
    },
  });
}

class PageNbStatic extends PageController("nb-static", {
  displayName: "Static",
  category: pagesCategory,
  badge: "new",
}) {
  static table = publishing("NbStaticTable", counting(4));
}

async function registerPage(
  page: ControllerClass,
  components: Record<string, ComponentBuilder<unknown>>,
): Promise<() => void> {
  const meta = GetMetadata(page, PageMetadata);
  for (const [key, component] of Object.entries(components)) {
    meta.SetComponent(key, component);
  }
  return registerTestPage(page);
}

async function badgesFor(
  grantedPermissions: string[],
  requestContext: RequestContext | null = REQUEST,
): Promise<Record<string, string | undefined>> {
  const { memberModel, roleModel } = stubPageAccessModels(grantedPermissions);
  const payload = await buildSiteLayoutPayload(
    USER,
    memberModel,
    roleModel,
    TENANT,
    requestContext ?? undefined,
  );
  const pages = payload.siteLayoutTree.children.pages?.children ?? {};
  return Object.fromEntries(
    Object.values(pages).map((page) => [page.fullId, page.badge]),
  );
}

describe("[unit] implementations/dms/page — navigation badges", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    cleanups.push(
      await registerPage(PageNbMembers, { table: PageNbMembers.table }),
      await registerPage(PageNbInvites, { section: PageNbInvites.section }),
      await registerPage(PageNbFailing, { table: PageNbFailing.table }),
      await registerPage(PageNbStatic, { table: PageNbStatic.table }),
    );
  });

  after(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const ALL_PAGES = [
    "pages.nb-members",
    "pages.nb-invites",
    "pages.nb-failing",
    "pages.nb-static",
  ];

  it("shows the count a page publishes for itself, nested or not, but not zero", async () => {
    const badges = await badgesFor(ALL_PAGES);

    expect(badges["pages.nb-members"]).to.equal("7");
    expect(badges["pages.nb-invites"]).to.equal(undefined);
  });

  it("keeps a page's declared badge, and drops a count that fails", async () => {
    const badges = await badgesFor(ALL_PAGES);

    expect(badges["pages.nb-static"]).to.equal("new");
    expect(badges["pages.nb-failing"]).to.equal(undefined);
  });

  it("counts only for the pages the caller can open", async () => {
    const badges = await badgesFor(["pages.nb-invites"]);

    expect(badges["pages.nb-members"]).to.equal(undefined);
  });

  it("serves no badge outside a request", async () => {
    const badges = await badgesFor(ALL_PAGES, null);

    expect(badges["pages.nb-members"]).to.equal(undefined);
  });
});
