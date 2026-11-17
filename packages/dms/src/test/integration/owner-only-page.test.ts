import { GetModel } from "@antelopejs/interface-database-decorators";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel } from "@antelopejs/interface-dms/db";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import type { RoleEditorPermissionNode } from "../../pages/permissions";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const PAGE = "owner-only-tools";
const BLOCK = `${PAGE}.notes`;
const PAGE_LAYOUT = pageRoutePath(PAGE, "/pagelayout");
const EDITOR_TREE = pageRoutePath("/settings/workspace/roles", "/editor-tree");
const GRANTABLE_ROOT_PAGE = "base-notes";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

async function memberHolding(permissions: string[]): Promise<AxiosInstance> {
  const [role] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
    name: `Holds ${permissions.join(", ")}`,
    permissions,
  });
  const member = await registerUser({ roles_ids: [role] });
  return authorizedClient(member.accessToken);
}

function nodeIds(nodes: RoleEditorPermissionNode[]): string[] {
  return nodes.flatMap((node) => [node.id, ...nodeIds(node.children ?? [])]);
}

async function openPage(client: AxiosInstance) {
  return client.get("/dms/page", {
    params: { path: `/${PAGE}`, shared: "false" },
  });
}

describe("[integration] an ownerOnly page outside a module", () => {
  beforeEach(resetDatabase);

  it("refuses a member whose role holds the page and its block, as a module page does", async () => {
    const client = await memberHolding([PAGE, BLOCK]);

    const layout = await client.get(PAGE_LAYOUT);
    expect(layout.status, JSON.stringify(layout.data)).to.equal(HTTP_FORBIDDEN);
    expect(String(layout.data)).to.equal("Owner-only");

    const page = await openPage(client);
    expect(page.data.route?.hasAccess ?? false).to.equal(false);
  });

  it("serves the page and its blocks to the platform owner", async () => {
    const owner = await registerUser({ owner: true });
    const client = authorizedClient(owner.accessToken);

    const layout = await client.get(PAGE_LAYOUT);
    expect(layout.status, JSON.stringify(layout.data)).to.equal(HTTP_OK);
    expect(layout.data.components).to.have.property("notes");

    const page = await openPage(client);
    expect(page.data.route.hasAccess).to.equal(true);
  });

  it("leaves the page and its block out of the Roles editor", async () => {
    const owner = await registerUser({ owner: true });
    const client = authorizedClient(owner.accessToken);

    const tree = await client.get<RoleEditorPermissionNode[]>(EDITOR_TREE);
    expect(tree.status, JSON.stringify(tree.data)).to.equal(HTTP_OK);
    const ids = nodeIds(tree.data);
    expect(ids).to.include(GRANTABLE_ROOT_PAGE);
    expect(ids).to.not.include(PAGE);
    expect(ids).to.not.include(BLOCK);
  });
});
