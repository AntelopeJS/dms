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
import { registerBranding } from "../../branding";
import { startMockupEngine, stopMockupEngine } from "../../mockup";
import type { RoleEditorPermissionNode } from "../../pages/permissions";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";

const EDITOR_TREE = pageRoutePath("/settings/workspace/roles", "/editor-tree");
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

interface DevArea {
  slug: string;
  api: string;
  start: (scratch: string) => void;
  stop: () => void;
}

/** The development-only areas whose page must stay the platform owner's alone. */
const DEV_AREAS: DevArea[] = [
  {
    slug: "/branding",
    api: "/api/branding",
    start: () => registerBranding(),
    stop: () => undefined,
  },
  {
    slug: "/mockup",
    api: "/api/mockup",
    start: (scratch) => startMockupEngine(scratch),
    stop: stopMockupEngine,
  },
];

function unregisterRoutesUnder(api: string): void {
  for (const route of getRegisteredRoutes()) {
    if (route.location.startsWith(api)) UnregisterRoute(Number(route.id));
  }
}

function registeredPage(slug: string): PageInfo | undefined {
  for (const { handler } of getRegisteredRouteHandlers()) {
    const { pageInfo } = GetMetadata(handler.controller, PageMetadata);
    if (pageInfo?.fullSlug === slug) return pageInfo;
  }
  return undefined;
}

async function memberHolding(permission: string): Promise<AxiosInstance> {
  const [role] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
    name: `Holds ${permission}`,
    permissions: [permission],
  });
  const member = await registerUser({ roles_ids: [role] });
  return authorizedClient(member.accessToken);
}

function nodeIds(nodes: RoleEditorPermissionNode[]): string[] {
  return nodes.flatMap((node) => [node.id, ...nodeIds(node.children ?? [])]);
}

for (const { slug, api, start, stop } of DEV_AREAS) {
  describe(`[integration] the ${slug} development page`, () => {
    let page: PageInfo;
    let layout: string;
    let scratch: string;

    before(async () => {
      scratch = await mkdtemp(join(tmpdir(), "dms-owner-only-page-"));
      start(scratch);
      const found = registeredPage(slug);
      if (!found) throw new Error(`${slug} registered no page`);
      page = found;
      layout = pageRoutePath(page.fullSlug, "/pagelayout");
    });

    after(async () => {
      stop();
      unregisterRoutesUnder(api);
      pageInterfaceInternal.RegisterPage.unregister(page);
      await rm(scratch, { recursive: true, force: true });
    });

    beforeEach(resetDatabase);

    it("refuses a member whose role holds the page's permission", async () => {
      const member = await memberHolding(page.fullId);

      const answer = await member.get(layout);

      expect(answer.status, JSON.stringify(answer.data)).to.equal(
        HTTP_FORBIDDEN,
      );
      expect(String(answer.data)).to.equal("Owner-only");
    });

    it("refuses a caller with no session", async () => {
      const answer = await createClient().get(layout);

      expect(answer.status).to.not.equal(HTTP_OK);
    });

    it("serves the page to the platform owner", async () => {
      const owner = await registerUser({ owner: true });

      const answer = await authorizedClient(owner.accessToken).get(layout);

      expect(answer.status, JSON.stringify(answer.data)).to.equal(HTTP_OK);
    });

    it("is left out of the Roles editor, so no role can be granted it", async () => {
      const owner = await registerUser({ owner: true });

      const tree = await authorizedClient(owner.accessToken).get<
        RoleEditorPermissionNode[]
      >(EDITOR_TREE);

      expect(tree.status, JSON.stringify(tree.data)).to.equal(HTTP_OK);
      expect(nodeIds(tree.data)).to.not.include(page.fullId);
    });
  });
}
