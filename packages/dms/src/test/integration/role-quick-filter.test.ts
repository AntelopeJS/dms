import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { seedUserInvite } from "../helpers/fixtures";

const ROLES = pageRoutePath("/settings/workspace/roles");
const MEMBERS = "/api/tables/members";
const INVITES = "/api/tables/admin-invites";
const HTTP_OK = 200;
const INVITED_EDITOR = "invited-editor@test.local";
const INVITED_READER = "invited-reader@test.local";

/**
 * The mode the toolbar sends for a quick filter that declares none on a
 * multiple relation (`TableViewQuickFilter.mode`), as the Members and Invites
 * role filters do.
 */
const UNDECLARED_MULTIPLE_MODE = "array_contains_string";

interface EmailRow {
  email: string;
}

describe("[integration] the role quick filter of members and invites", () => {
  let client: AxiosInstance;
  let editors: string;
  let editorEmail: string;

  async function createRole(name: string): Promise<string> {
    const response = await client.post<{ id: string }>(`${ROLES}/create`, {
      name,
    });
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response.data.id;
  }

  async function emailsWithRole(
    table: string,
    field: string,
    roleId: string,
  ): Promise<string[]> {
    const response = await client.get<{ results: EmailRow[] }>(
      `${table}/list`,
      {
        params: {
          limit: 50,
          [`filter_${field}`]: `${UNDECLARED_MULTIPLE_MODE}:${roleId}`,
        },
      },
    );
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response.data.results.map((row) => row.email).sort();
  }

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
    editors = await createRole("Editors");
    const readers = await createRole("Readers");
    editorEmail = (await registerUser({ roles_ids: [editors] })).email;
    await registerUser({ roles_ids: [readers] });
    await seedUserInvite({ email: INVITED_EDITOR, roles_ids: [editors] });
    await seedUserInvite({ email: INVITED_READER, roles_ids: [readers] });
  });

  it("lists only the members holding the picked role", async () => {
    expect(await emailsWithRole(MEMBERS, "roleIds", editors)).to.deep.equal([
      editorEmail,
    ]);
  });

  it("lists only the invitations granting the picked role", async () => {
    expect(await emailsWithRole(INVITES, "roles_ids", editors)).to.deep.equal([
      INVITED_EDITOR,
    ]);
  });
});
