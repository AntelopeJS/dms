import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getRegisteredRouteHandlers,
  getRegisteredRoutes,
  UnregisterRoute,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel } from "@antelopejs/interface-dms/db";
import {
  PageMetadata,
  type PageInfo,
  pageRoutePath,
  internal as pageInterfaceInternal,
} from "@antelopejs/interface-dms/page";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import {
  MOCKUP_REVIEW_PERMISSION_ID,
  startMockupEngine,
  stopMockupEngine,
} from "../../mockup";
import type { RoleEditorPermissionNode } from "../../pages/permissions";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";

const EDITOR_TREE = pageRoutePath("/settings/workspace/roles", "/editor-tree");
const MOCKUP_API = "/api/mockup";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

function unregisterRoutesUnder(api: string): void {
  for (const route of getRegisteredRoutes()) {
    if (route.location.startsWith(api)) UnregisterRoute(Number(route.id));
  }
}

function registeredPage(slug: string): PageInfo {
  for (const { handler } of getRegisteredRouteHandlers()) {
    const { pageInfo } = GetMetadata(handler.controller, PageMetadata);
    if (pageInfo?.fullSlug === slug) return pageInfo;
  }
  throw new Error(`${slug} registered no page`);
}

async function memberHolding(permission: string): Promise<AxiosInstance> {
  const [role] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
    name: `Holds ${permission}`,
    permissions: [permission],
  });
  const member = await registerUser({ roles_ids: [role] });
  return authorizedClient(member.accessToken);
}

async function platformOwner(): Promise<AxiosInstance> {
  const owner = await registerUser({ owner: true });
  return authorizedClient(owner.accessToken);
}

function nodeIds(nodes: RoleEditorPermissionNode[]): string[] {
  return nodes.flatMap((node) => [node.id, ...nodeIds(node.children ?? [])]);
}

async function editorTreeIds(owner: AxiosInstance): Promise<string[]> {
  const tree = await owner.get<RoleEditorPermissionNode[]>(EDITOR_TREE);
  expect(tree.status, JSON.stringify(tree.data)).to.equal(HTTP_OK);
  return nodeIds(tree.data);
}

describe("[integration] the mockup development pages", () => {
  let list: PageInfo;
  let viewer: PageInfo;
  let listLayout: string;
  let viewerLayout: string;
  let scratch: string;

  before(async () => {
    scratch = await mkdtemp(join(tmpdir(), "dms-owner-only-page-"));
    startMockupEngine(scratch);
    list = registeredPage("/mockups");
    viewer = registeredPage("/mockup");
    listLayout = pageRoutePath(list.fullSlug, "/pagelayout");
    viewerLayout = pageRoutePath(viewer.fullSlug, "/pagelayout");
  });

  after(async () => {
    stopMockupEngine();
    unregisterRoutesUnder(MOCKUP_API);
    pageInterfaceInternal.RegisterPage.unregister(list);
    pageInterfaceInternal.RegisterPage.unregister(viewer);
    await rm(scratch, { recursive: true, force: true });
  });

  beforeEach(resetDatabase);

  describe("/mockups, the platform owner's list", () => {
    it("refuses a member whose role holds the page's permission", async () => {
      const member = await memberHolding(list.fullId);

      const answer = await member.get(listLayout);

      expect(answer.status, JSON.stringify(answer.data)).to.equal(
        HTTP_FORBIDDEN,
      );
      expect(answer.data).to.equal("$dms.refusals.auth.owner_only");
    });

    it("refuses a caller with no session", async () => {
      const answer = await createClient().get(listLayout);

      expect(answer.status).to.not.equal(HTTP_OK);
    });

    it("serves the page to the platform owner", async () => {
      const answer = await (await platformOwner()).get(listLayout);

      expect(answer.status, JSON.stringify(answer.data)).to.equal(HTTP_OK);
    });

    it("is left out of the Roles editor, so no role can be granted it", async () => {
      expect(await editorTreeIds(await platformOwner())).to.not.include(
        list.fullId,
      );
    });
  });

  describe("/mockup, the viewer a reviewer's role opens", () => {
    it("refuses a member whose role holds another permission, and a caller with no session (fails when the viewer opens to every member)", async () => {
      const member = await memberHolding(list.fullId);

      const refused = await member.get(viewerLayout);
      const anonymous = await createClient().get(viewerLayout);

      expect(refused.status, JSON.stringify(refused.data)).to.equal(
        HTTP_FORBIDDEN,
      );
      expect(anonymous.status).to.not.equal(HTTP_OK);
    });

    it("serves the page to a member whose role holds the review permission, as to the platform owner (fails when only the owner opens the viewer)", async () => {
      const reviewer = await memberHolding(MOCKUP_REVIEW_PERMISSION_ID);

      const reviewed = await reviewer.get(viewerLayout);
      const owned = await (await platformOwner()).get(viewerLayout);

      expect(reviewed.status, JSON.stringify(reviewed.data)).to.equal(HTTP_OK);
      expect(owned.status, JSON.stringify(owned.data)).to.equal(HTTP_OK);
    });

    it("offers the review permission in the Roles editor, so a role can be granted it (fails when the viewer stays owner-only)", async () => {
      expect(await editorTreeIds(await platformOwner())).to.include(
        MOCKUP_REVIEW_PERMISSION_ID,
      );
    });
  });
});
