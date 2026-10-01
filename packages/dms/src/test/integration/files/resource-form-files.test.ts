import { stripStagingPrefix } from "@antelopejs/interface-file-storage";
import axios, { type AxiosInstance } from "axios";
import { expect } from "chai";
import {
  findUploadToken,
  nativeUploadToken,
  uploadAttachment,
} from "../../helpers/attachments";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";

const CONTENT = Buffer.from("resource-form file");
const METADATA = "/api/files/metadata";
const PRESIGN_URL = "/api/files/presign";
const LOCATION = "/api/native-attachments";
const FILE_FIELD = `${LOCATION}#file`;
// ResourceForm blocks posting to the same data routes as the TableViews of
// the controller (see the attachment test host).
const NEW_FORM_SLUG = "/nativefiles-new-form";
const EDIT_FORM_SLUG = "/nativefiles-edit-form";
const PROFILE_SLUG = "/settings/user/profile";
const FIELD_MAX_SIZE = 64;

async function ownerClient(): Promise<AxiosInstance> {
  const owner = await registerUser({ owner: true });
  return authorizedClient(owner.accessToken);
}

async function formUploadToken(
  client: AxiosInstance,
  slug: string,
): Promise<string> {
  const layout = await client.get("/dms/pagelayout", { params: { slug } });
  expect(layout.status, JSON.stringify(layout.data)).to.equal(200);
  const token = findUploadToken(layout.data.components.content, FILE_FIELD);
  if (!token) throw new Error(`No upload token on ${slug}`);
  return token;
}

async function stageFrom(client: AxiosInstance, slug: string): Promise<string> {
  const upload = await uploadAttachment({
    client,
    content: CONTENT,
    mimetype: "text/plain",
    claims: {},
    filename: "file.txt",
    token: await formUploadToken(client, slug),
  });
  return upload.key;
}

async function storedUrl(client: AxiosInstance, key: string): Promise<string> {
  const promoted = await client.get(METADATA, {
    params: { resourceKey: stripStagingPrefix(key) },
  });
  expect(promoted.status, JSON.stringify(promoted.data)).to.equal(200);
  return promoted.data.url;
}

describe("[integration] native files submitted from ResourceForm blocks", () => {
  beforeEach(resetDatabase);

  it("promotes a file staged from a new ResourceForm", async () => {
    const client = await ownerClient();
    const key = await stageFrom(client, NEW_FORM_SLUG);
    const saved = await client.post(`${LOCATION}/new`, { file: key });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(200);
    await storedUrl(client, key);
  });

  it("promotes a file staged from an edit ResourceForm over a TableView's row", async () => {
    const client = await ownerClient();
    const tableKey = (
      await uploadAttachment({
        client,
        content: CONTENT,
        mimetype: "text/plain",
        claims: {},
        filename: "table.txt",
        token: await nativeUploadToken(client),
      })
    ).key;
    const created = await client.post(`${LOCATION}/new`, { file: tableKey });
    expect(created.status, JSON.stringify(created.data)).to.equal(200);
    const tableUrl = await storedUrl(client, tableKey);

    const formKey = await stageFrom(client, EDIT_FORM_SLUG);
    const edited = await client.put(
      `${LOCATION}/edit`,
      { file: formKey },
      { params: { id: created.data[0] } },
    );
    expect(edited.status, JSON.stringify(edited.data)).to.equal(200);
    await storedUrl(client, formKey);
    expect(
      (await axios.get(tableUrl, { validateStatus: () => true })).status,
      "the replaced file is cleaned up",
    ).to.equal(404);
  });

  it("deletes a row holding a ResourceForm file through the shared delete route", async () => {
    const client = await ownerClient();
    const key = await stageFrom(client, NEW_FORM_SLUG);
    const saved = await client.post(`${LOCATION}/new`, { file: key });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(200);
    const url = await storedUrl(client, key);
    const removed = await client.delete(`${LOCATION}/delete`, {
      params: { id: saved.data[0] },
    });
    expect(removed.status, JSON.stringify(removed.data)).to.equal(200);
    expect(
      (await axios.get(url, { validateStatus: () => true })).status,
    ).to.equal(404);
  });

  it("still denies a file staged by a component that does not write to the controller", async () => {
    const client = await ownerClient();
    const layout = await client.get("/dms/pagelayout", {
      params: { slug: PROFILE_SLUG },
    });
    expect(layout.status, JSON.stringify(layout.data)).to.equal(200);
    const avatar = await uploadAttachment({
      client,
      content: CONTENT,
      mimetype: "image/png",
      claims: {},
      filename: "avatar.png",
      token: findUploadToken(layout.data, "profile-avatar#avatar"),
    });
    const foreign = await client.post(`${LOCATION}/new`, {
      image: { key: avatar.key },
    });
    expect(foreign.status).to.equal(403);
  });

  it("applies the column's constraints at presign for a ResourceForm field", async () => {
    const client = await ownerClient();
    const response = await client.post(PRESIGN_URL, {
      filename: "large.txt",
      size: FIELD_MAX_SIZE + 1,
      mimetype: "text/plain",
      uploadToken: await formUploadToken(client, NEW_FORM_SLUG),
    });
    expect(response.status).to.equal(400);
  });
});
