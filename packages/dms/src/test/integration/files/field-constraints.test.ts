import type { AxiosInstance } from "axios";
import { expect } from "chai";
import {
  findUploadToken,
  nativeUploadToken,
  uploadAttachment,
} from "../../helpers/attachments";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";

const PRESIGN_URL = "/api/files/presign";
const LOCATION = "/api/native-attachments";
const PROFILE_SLUG = "/settings/user/profile";
const AVATAR_FIELD = "profile-avatar#avatar";
const FIELD_MAX_SIZE = 64;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;

interface PresignCase {
  field: string;
  mimetype: string;
  size: number;
}

async function ownerClient(): Promise<AxiosInstance> {
  const user = await registerUser({ owner: true });
  return authorizedClient(user.accessToken);
}

async function presign(
  client: AxiosInstance,
  uploadToken: string,
  { mimetype, size }: Omit<PresignCase, "field">,
) {
  return client.post(PRESIGN_URL, {
    filename: "upload.bin",
    size,
    mimetype,
    uploadToken,
  });
}

async function presignTableField(client: AxiosInstance, request: PresignCase) {
  return presign(
    client,
    await nativeUploadToken(client, request.field),
    request,
  );
}

async function avatarToken(client: AxiosInstance): Promise<string> {
  const layout = await client.get("/dms/pagelayout", {
    params: { slug: PROFILE_SLUG },
  });
  expect(layout.status, JSON.stringify(layout.data)).to.equal(HTTP_OK);
  const token = findUploadToken(layout.data, AVATAR_FIELD);
  if (!token) throw new Error("No upload token for the profile avatar");
  return token;
}

const ACCEPTED: PresignCase[] = [
  { field: "file", mimetype: "text/plain", size: FIELD_MAX_SIZE },
  { field: "files", mimetype: "application/pdf", size: 1024 },
  { field: "image", mimetype: "image/jpeg", size: 1024 },
  { field: "gallery", mimetype: "image/png", size: FIELD_MAX_SIZE },
];

const REJECTED: PresignCase[] = [
  { field: "file", mimetype: "text/plain", size: FIELD_MAX_SIZE + 1 },
  { field: "image", mimetype: "text/plain", size: 16 },
  { field: "gallery", mimetype: "image/jpeg", size: 16 },
  { field: "gallery", mimetype: "image/png", size: FIELD_MAX_SIZE + 1 },
];

describe("[integration] native field constraints at presign", () => {
  beforeEach(resetDatabase);

  it("presigns uploads that satisfy the table-view column constraints", async () => {
    const client = await ownerClient();
    for (const request of ACCEPTED) {
      const response = await presignTableField(client, request);
      expect(response.status, JSON.stringify(request)).to.equal(HTTP_OK);
    }
  });

  it("rejects uploads that break the table-view column constraints with 400", async () => {
    const client = await ownerClient();
    for (const request of REJECTED) {
      const response = await presignTableField(client, request);
      expect(response.status, JSON.stringify(request)).to.equal(
        HTTP_BAD_REQUEST,
      );
      expect(String(response.data)).to.match(/^Upload rejected: /);
    }
  });

  it("applies a standalone form field's own constraints", async () => {
    const client = await ownerClient();
    const token = await avatarToken(client);
    const accepted = await presign(client, token, {
      mimetype: "image/png",
      size: 16,
    });
    expect(accepted.status, JSON.stringify(accepted.data)).to.equal(HTTP_OK);
    const rejected = await presign(client, token, {
      mimetype: "text/plain",
      size: 16,
    });
    expect(rejected.status).to.equal(HTTP_BAD_REQUEST);
    expect(String(rejected.data)).to.contain("image/png");
  });

  it("still rejects at promotion a key staged through a laxer field", async () => {
    const client = await ownerClient();
    const upload = await uploadAttachment({
      client,
      content: Buffer.from("not an image"),
      mimetype: "text/plain",
      claims: {},
      filename: "note.txt",
      token: await nativeUploadToken(client, "files"),
    });
    const saved = await client.post(`${LOCATION}/new`, {
      gallery: [{ key: upload.key }],
    });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(HTTP_FORBIDDEN);
  });
});
