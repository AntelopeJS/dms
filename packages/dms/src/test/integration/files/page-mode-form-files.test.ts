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

const CONTENT = Buffer.from("page-mode form file");
const METADATA = "/api/files/metadata";
const PRESIGN_URL = "/api/files/presign";
const LOCATION = "/api/native-attachments";
const FILE_FIELD = `${LOCATION}#file`;
// A TableView with no formContainer opens its forms in page mode: each one is
// the component of a hidden sub-page, not embedded in the table's options.
// A sub-page's layout is served under its route pattern (`…/:id/edit`).
const TABLE_SLUG = "/nativefiles";
const PROFILE_SLUG = "/settings/user/profile";

type FormPageKind = "new" | "edit";

async function ownerClient(): Promise<AxiosInstance> {
  const owner = await registerUser({ owner: true });
  return authorizedClient(owner.accessToken);
}

async function formPageSlug(
  client: AxiosInstance,
  kind: FormPageKind,
): Promise<string> {
  const layout = await client.get("/dms/pagelayout", {
    params: { slug: TABLE_SLUG },
  });
  expect(layout.status, JSON.stringify(layout.data)).to.equal(200);
  return layout.data.components.content.options.formPages[kind];
}

async function subPageUploadToken(
  client: AxiosInstance,
  slug: string,
): Promise<string> {
  const layout = await client.get("/dms/pagelayout", { params: { slug } });
  expect(layout.status, JSON.stringify(layout.data)).to.equal(200);
  const token = findUploadToken(layout.data.components.form, FILE_FIELD);
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
    token: await subPageUploadToken(client, slug),
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

describe("[integration] native files submitted from page-mode TableView forms", () => {
  beforeEach(resetDatabase);

  it("promotes a file staged from the table's new form sub-page", async () => {
    const client = await ownerClient();
    const key = await stageFrom(client, await formPageSlug(client, "new"));
    const saved = await client.post(`${LOCATION}/new`, { file: key });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(200);
    await storedUrl(client, key);
  });

  it("replaces a file from the table's edit form sub-page and cleans the old one", async () => {
    const client = await ownerClient();
    const createdKey = await stageFrom(
      client,
      await formPageSlug(client, "new"),
    );
    const created = await client.post(`${LOCATION}/new`, { file: createdKey });
    expect(created.status, JSON.stringify(created.data)).to.equal(200);
    const createdUrl = await storedUrl(client, createdKey);

    const editedKey = await stageFrom(
      client,
      await formPageSlug(client, "edit"),
    );
    const edited = await client.put(
      `${LOCATION}/edit`,
      { file: editedKey },
      { params: { id: created.data[0] } },
    );
    expect(edited.status, JSON.stringify(edited.data)).to.equal(200);
    await storedUrl(client, editedKey);
    expect(
      (await axios.get(createdUrl, { validateStatus: () => true })).status,
      "the replaced file is cleaned up",
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
});

describe("[integration] saving a native file that was never stored", () => {
  beforeEach(resetDatabase);

  it("answers 400 without leaking the storage key", async () => {
    const client = await ownerClient();
    const presigned = await client.post(PRESIGN_URL, {
      filename: "never-uploaded.txt",
      size: CONTENT.byteLength,
      mimetype: "text/plain",
      uploadToken: await nativeUploadToken(client),
    });
    expect(presigned.status, JSON.stringify(presigned.data)).to.equal(200);
    const key: string = presigned.data.resourceKey;

    const saved = await client.post(`${LOCATION}/new`, { file: key });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(400);
    expect(JSON.stringify(saved.data)).to.not.include(stripStagingPrefix(key));
  });
});
