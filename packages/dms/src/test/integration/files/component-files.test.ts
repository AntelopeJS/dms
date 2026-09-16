import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  isStagedKey,
  STAGING_PREFIX,
  stripStagingPrefix,
} from "@antelopejs/interface-file-storage";
import axios from "axios";
import { expect } from "chai";
import { attachmentId } from "../../../attachments/registry";
import { SaveComponentFiles } from "../../../attachments/save";
import { AttachmentModel } from "../../../db/models/attachments.model";
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

const CONTENT = Buffer.from("component-owned file");
const METADATA = "/api/files/metadata";
const LOCATION = "/api/native-attachments";

async function ownerUpload(field = "file") {
  const user = await registerUser({ owner: true });
  const client = authorizedClient(user.accessToken);
  const token = await nativeUploadToken(client, field);
  const upload = await uploadAttachment({
    client,
    content: CONTENT,
    mimetype: "text/plain",
    claims: {},
    filename: "file.txt",
    token,
  });
  return { user, client, token, upload };
}

describe("[integration] native component file security", () => {
  beforeEach(resetDatabase);

  it("allows another authorized reader before save but denies upload without an add/edit grant", async () => {
    const { client, token, upload } = await ownerUpload();
    const claims = verifyUploadToken(token);
    if (!claims?.pageId || !claims.componentId)
      throw new Error("Missing native claims");
    const roles = GetModel(RoleModel, DEFAULT_TENANT_ID);
    const [role] = await roles.insert({
      name: "File reader",
      permissions: [claims.pageId, claims.componentId],
    });
    const reader = await registerUser({ roles_ids: [role] });
    const other = authorizedClient(reader.accessToken);
    const metadata = await other.get(METADATA, {
      params: { resourceKey: upload.key },
    });
    expect(metadata.status, JSON.stringify(metadata.data)).to.equal(200);
    expect(metadata.data.expiresAt).to.be.at.most(Date.now() + 60000);
    expect((await axios.get(metadata.data.url)).data).to.equal(
      CONTENT.toString(),
    );
    const denied = await other.post("/api/files/presign", {
      filename: "copy.txt",
      size: CONTENT.length,
      mimetype: "text/plain",
      uploadToken: token,
    });
    expect(denied.status).to.equal(403);
    await roles.update(role, { permissions: [claims.pageId] });
    expect(
      (await other.get(METADATA, { params: { resourceKey: upload.key } }))
        .status,
    ).to.equal(403);
    expect(
      (await client.get(METADATA, { params: { resourceKey: upload.key } }))
        .status,
    ).to.equal(200);
  });

  it("rejects cross-tenant reads and unclassified legacy/media keys", async () => {
    const { client, upload } = await ownerUpload();
    for (const key of ["legacy/file.pdf", "media/library.png"]) {
      expect(
        (await client.get(METADATA, { params: { resourceKey: key } })).status,
      ).to.equal(403);
    }
    await GetModel(AttachmentModel).update(attachmentId(upload.key), {
      tenantId: "other-tenant",
    });
    expect(
      (await client.get(METADATA, { params: { resourceKey: upload.key } }))
        .status,
    ).to.equal(403);
  });

  it("serves public staging immediately without a document save", async () => {
    const { client, upload } = await ownerUpload("publicFile");
    expect(isStagedKey(upload.key)).to.equal(true);
    const metadata = await client.get(METADATA, {
      params: { resourceKey: upload.key },
    });
    expect(metadata.status, JSON.stringify(metadata.data)).to.equal(200);
    expect(metadata.data.expiresAt).to.equal(undefined);
    expect((await axios.get(metadata.data.url)).data).to.equal(
      CONTENT.toString(),
    );
  });

  it("promotes an aliased field without changing provenance and deletes it after removal", async () => {
    const { client, upload } = await ownerUpload();
    const saved = await client.post(`${LOCATION}/new`, {
      file: upload.key,
      files: [],
      readerId: "row-read-denied",
    });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(200);
    const key = stripStagingPrefix(upload.key);
    const metadata = await client.get(METADATA, {
      params: { resourceKey: key },
    });
    expect(metadata.status, JSON.stringify(metadata.data)).to.equal(200);
    expect(
      (await client.get(`${LOCATION}/get`, { params: { id: saved.data[0] } }))
        .status,
    ).to.equal(403);
    const removed = await client.put(
      `${LOCATION}/edit`,
      { file: "" },
      { params: { id: saved.data[0] } },
    );
    expect(removed.status, JSON.stringify(removed.data)).to.equal(200);
    expect(
      (await axios.get(metadata.data.url, { validateStatus: () => true }))
        .status,
    ).to.equal(404);
  });

  it("rejects a forged field declaration and a view-only token even for an owner", async () => {
    const { client, token } = await ownerUpload();
    const viewToken = await nativeUploadToken(client, "file", "view");
    for (const uploadToken of [viewToken, `${token.slice(0, -8)}tampered`]) {
      const response = await client.post("/api/files/presign", {
        filename: "copy.txt",
        size: CONTENT.length,
        mimetype: "text/plain",
        uploadToken,
      });
      expect(response.status).to.equal(403);
    }
  });

  it("deletes all files in a multiple field after row deletion", async () => {
    const { client, upload } = await ownerUpload("files");
    const second = await uploadAttachment({
      client,
      content: CONTENT,
      mimetype: "text/plain",
      claims: {},
      filename: "second.txt",
      token: await nativeUploadToken(client, "files"),
    });
    const saved = await client.post(`${LOCATION}/new`, {
      files: [upload.key, second.key],
    });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(200);
    const links = await Promise.all(
      [upload, second].map(async (file) => {
        const metadata = await client.get(METADATA, {
          params: { resourceKey: stripStagingPrefix(file.key) },
        });
        expect(metadata.status).to.equal(200);
        return metadata.data.url;
      }),
    );
    const removed = await client.delete(`${LOCATION}/delete`, {
      params: { id: saved.data[0] },
    });
    expect(removed.status, JSON.stringify(removed.data)).to.equal(200);
    for (const url of links)
      expect(
        (await axios.get(url, { validateStatus: () => true })).status,
      ).to.equal(404);
  });

  it("rejects a new unknown key before promoting other submitted files", async () => {
    const { client, upload } = await ownerUpload();
    const saved = await client.post(`${LOCATION}/new`, {
      file: upload.key,
      files: ["legacy/unclassified.txt"],
    });
    expect(saved.status).to.equal(403);
    expect(
      (await client.get(METADATA, { params: { resourceKey: upload.key } }))
        .status,
    ).to.equal(200);
    expect(
      (
        await client.get(METADATA, {
          params: { resourceKey: stripStagingPrefix(upload.key) },
        })
      ).status,
    ).to.equal(404);
  });

  it("rejects a retained reference that belongs to no attachment", async () => {
    const document = { file: `${STAGING_PREFIX}unclassified/missing.txt` };
    let saves = 0;
    const denied = await SaveComponentFiles(
      {
        context: {} as RequestContext,
        componentIds: [],
        fields: [{ id: "unclassified#file", key: "file", kind: "file" }],
        before: document,
        submitted: document,
      },
      async (submitted) => {
        saves += 1;
        return { document: submitted, result: "saved" };
      },
    ).catch((error: unknown) => error);
    expect(denied).to.be.instanceOf(HTTPResult);
    expect(saves).to.equal(0);
  });

  it("retains promoted profile images after a failed save and retries the staged reference", async () => {
    const { client, user } = await ownerUpload();
    const layout = await client.get("/dms/pagelayout", {
      params: { slug: "/settings/user/profile" },
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
    const failed = await client.post("/settings/user/profile", {
      avatar: { key: image.key },
      email: "invalid",
      name: "Test",
    });
    expect(failed.status, JSON.stringify(failed.data)).to.equal(400);
    expect(
      (await client.get(METADATA, { params: { resourceKey: image.key } }))
        .status,
    ).to.equal(404);
    const retained = await client.get(METADATA, {
      params: { resourceKey: stripStagingPrefix(image.key) },
    });
    expect(retained.status).to.equal(200);
    expect((await axios.get(retained.data.url)).data).to.equal(
      CONTENT.toString(),
    );
    const saved = await client.post("/settings/user/profile", {
      avatar: { key: image.key },
      email: user.email,
      name: "Test",
    });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(200);
    expect(saved.data.avatar.key).to.equal(stripStagingPrefix(image.key));
  });

  it("preserves other localized images through a partial edit", async () => {
    const { client } = await ownerUpload();
    const token = await nativeUploadToken(client, "image");
    const first = await uploadAttachment({
      client,
      content: CONTENT,
      mimetype: "image/png",
      claims: {},
      filename: "english.png",
      token,
    });
    const second = await uploadAttachment({
      client,
      content: CONTENT,
      mimetype: "image/png",
      claims: {},
      filename: "french.png",
      token,
    });
    const saved = await client.post(
      `${LOCATION}/new`,
      { image: { en: { key: first.key } } },
      { headers: { "x-content-language": "*" } },
    );
    expect(saved.status, JSON.stringify(saved.data)).to.equal(200);
    const updated = await client.put(
      `${LOCATION}/edit`,
      {
        image: {
          en: { key: stripStagingPrefix(first.key) },
          fr: { key: second.key },
        },
      },
      {
        params: { id: saved.data[0] },
        headers: { "x-content-language": "*" },
      },
    );
    expect(updated.status, JSON.stringify(updated.data)).to.equal(200);
    const partial = await client.put(
      `${LOCATION}/edit`,
      { file: "" },
      {
        params: { id: saved.data[0] },
        headers: { "x-content-language": "*" },
      },
    );
    expect(partial.status, JSON.stringify(partial.data)).to.equal(200);
    for (const upload of [first, second])
      expect(
        (
          await client.get(METADATA, {
            params: { resourceKey: stripStagingPrefix(upload.key) },
          })
        ).status,
      ).to.equal(200);
  });
});
