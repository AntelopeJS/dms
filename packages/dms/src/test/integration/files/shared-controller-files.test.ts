import { GetModel } from "@antelopejs/interface-database-decorators";
import { stripStagingPrefix } from "@antelopejs/interface-file-storage";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel } from "@antelopejs/interface-dms/db";
import { verifyUploadToken } from "../../../utils/upload-token";
import {
  findUploadToken,
  nativeUploadToken,
  uploadAttachment,
} from "../../helpers/attachments";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";

const CONTENT = Buffer.from("shared-controller file");
const METADATA = "/api/files/metadata";
const LOCATION = "/api/native-attachments";
// Both pages mount a TableView on the same data controller; the secondary one
// is built last, which is the registration the controller used to remember.
const FIRST_TABLE_SLUG = "/nativefiles";
const LAST_TABLE_SLUG = "/nativefiles-secondary";
const PROFILE_SLUG = "/settings/user/profile";
const RELATION_INPUT = `${LOCATION}/form/relation`;

interface TableClaims {
  pageId: string;
  componentId: string;
}

async function ownerClient(): Promise<AxiosInstance> {
  const owner = await registerUser({ owner: true });
  return authorizedClient(owner.accessToken);
}

async function stageFrom(client: AxiosInstance, slug: string): Promise<string> {
  const token = await nativeUploadToken(client, "file", "new", slug);
  const upload = await uploadAttachment({
    client,
    content: CONTENT,
    mimetype: "text/plain",
    claims: {},
    filename: "file.txt",
    token,
  });
  return upload.key;
}

async function tableClaims(
  client: AxiosInstance,
  slug: string,
): Promise<TableClaims> {
  const claims = verifyUploadToken(
    await nativeUploadToken(client, "file", "new", slug),
  );
  if (!claims?.pageId || !claims.componentId)
    throw new Error(`No native claims on ${slug}`);
  return { pageId: claims.pageId, componentId: claims.componentId };
}

describe("[integration] native files on a data controller shared by several TableViews", () => {
  beforeEach(resetDatabase);

  for (const slug of [FIRST_TABLE_SLUG, LAST_TABLE_SLUG]) {
    it(`promotes a file staged from the TableView on ${slug}`, async () => {
      const client = await ownerClient();
      const key = await stageFrom(client, slug);
      const saved = await client.post(`${LOCATION}/new`, { file: key });
      expect(saved.status, JSON.stringify(saved.data)).to.equal(200);
      const promoted = await client.get(METADATA, {
        params: { resourceKey: stripStagingPrefix(key) },
      });
      expect(promoted.status, JSON.stringify(promoted.data)).to.equal(200);
    });
  }

  it("still denies a file staged by a component that is no TableView of the controller", async () => {
    const client = await ownerClient();
    const layout = await client.get("/dms/pagelayout", {
      params: { slug: PROFILE_SLUG },
    });
    expect(layout.status, JSON.stringify(layout.data)).to.equal(200);
    const token = findUploadToken(layout.data, "profile-avatar#avatar");
    expect(token).to.be.a("string");
    const image = await uploadAttachment({
      client,
      content: CONTENT,
      mimetype: "image/png",
      claims: {},
      filename: "avatar.png",
      token,
    });
    const foreign = await client.post(`${LOCATION}/new`, {
      image: { key: image.key },
    });
    expect(foreign.status).to.equal(403);
    expect(
      (await client.get(METADATA, { params: { resourceKey: image.key } }))
        .status,
    ).to.equal(200);
  });

  it("lets a user granted add on the first TableView only create a row with an image", async () => {
    const owner = await ownerClient();
    const firstTable = await tableClaims(owner, FIRST_TABLE_SLUG);
    const roles = GetModel(RoleModel, DEFAULT_TENANT_ID);
    const [firstTableEditor] = await roles.insert({
      name: "First table editor",
      permissions: [
        firstTable.pageId,
        firstTable.componentId,
        `${firstTable.componentId}.add`,
      ],
    });
    const editor = await registerUser({ roles_ids: [firstTableEditor] });
    const client = authorizedClient(editor.accessToken);
    const image = await uploadAttachment({
      client,
      content: CONTENT,
      mimetype: "image/png",
      claims: {},
      filename: "image.png",
      token: await nativeUploadToken(client, "image", "new", FIRST_TABLE_SLUG),
    });
    const created = await client.post(
      `${LOCATION}/new`,
      { image: { en: { key: image.key } } },
      { headers: { "x-content-language": "*" } },
    );
    expect(created.status, JSON.stringify(created.data)).to.equal(200);
    const promoted = await client.get(METADATA, {
      params: { resourceKey: stripStagingPrefix(image.key) },
    });
    expect(promoted.status, JSON.stringify(promoted.data)).to.equal(200);
  });

  it("refuses a user granted add on none of the controller's TableViews", async () => {
    const owner = await ownerClient();
    const firstTable = await tableClaims(owner, FIRST_TABLE_SLUG);
    const lastTable = await tableClaims(owner, LAST_TABLE_SLUG);
    const [viewer] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
      name: "Table viewer",
      permissions: [
        firstTable.pageId,
        firstTable.componentId,
        lastTable.pageId,
        lastTable.componentId,
      ],
    });
    const user = await registerUser({ roles_ids: [viewer] });
    const refused = await authorizedClient(user.accessToken).post(
      `${LOCATION}/new`,
      { readerId: "table-viewer" },
    );
    expect(refused.status).to.equal(403);
  });

  it("offers a relation's inline add to the add grant of every TableView", async () => {
    const owner = await ownerClient();
    const firstTable = await tableClaims(owner, FIRST_TABLE_SLUG);
    const lastTable = await tableClaims(owner, LAST_TABLE_SLUG);
    const relation = await owner.get(RELATION_INPUT);
    expect(relation.status, JSON.stringify(relation.data)).to.equal(200);
    expect(relation.data.options.addPermissionIds).to.have.members([
      `${firstTable.componentId}.add`,
      `${lastTable.componentId}.add`,
    ]);
  });
});
