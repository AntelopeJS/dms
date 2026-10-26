import { GetModel } from "@antelopejs/interface-database-decorators";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel } from "@antelopejs/interface-dms/db";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { pageRoutePath } from "@antelopejs/interface-dms/page";

const PAGE = "base-notes";
const TABLE = `${PAGE}.content`;
const PAGE_LAYOUT = pageRoutePath(PAGE, "/pagelayout");
const NEW_FORM_LAYOUT = pageRoutePath(PAGE, "/content/new/pagelayout");
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

describe("[integration] the layout route of a page and of its form pages", () => {
  beforeEach(resetDatabase);

  it("serves a page to a member granted it but none of its blocks, as /dms/page does", async () => {
    const client = await memberHolding([PAGE]);

    const own = await client.get(PAGE_LAYOUT);
    expect(own.status, JSON.stringify(own.data)).to.equal(HTTP_OK);
    expect(own.data.components).to.deep.equal({});
    expect(own.data.allComponentsHidden).to.equal(true);

    const page = await client.get("/dms/page", {
      params: { path: `/${PAGE}`, shared: "false" },
    });
    expect(page.status, JSON.stringify(page.data)).to.equal(HTTP_OK);
    expect(page.data.route.hasAccess).to.equal(true);
    expect(page.data.layout).to.deep.equal(own.data);
  });

  it("still refuses the page to a member without its permission", async () => {
    const client = await memberHolding([]);

    const own = await client.get(PAGE_LAYOUT);
    expect(own.status, JSON.stringify(own.data)).to.equal(HTTP_FORBIDDEN);
    expect(String(own.data)).to.include(`missing permission ${PAGE}`);
    expect(String(own.data)).to.not.include(`${TABLE}.`);
  });

  it("guards a form page with its own action, not the last form registered", async () => {
    const adding = await memberHolding([PAGE, TABLE, `${TABLE}.add`]);
    const viewing = await memberHolding([PAGE, TABLE, `${TABLE}.view`]);

    const added = await adding.get(NEW_FORM_LAYOUT);
    expect(added.status, JSON.stringify(added.data)).to.equal(HTTP_OK);

    const viewed = await viewing.get(NEW_FORM_LAYOUT);
    expect(viewed.status, JSON.stringify(viewed.data)).to.equal(HTTP_FORBIDDEN);
    expect(String(viewed.data)).to.include(`missing permission ${TABLE}.add`);
  });
});
