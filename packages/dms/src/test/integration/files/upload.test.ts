import axios from "axios";
import { expect } from "chai";
import { DEFAULT_MAX_UPLOAD_SIZE } from "../../../index";
import { nativeUploadToken } from "../../helpers/attachments";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";

const PRESIGN_URL = "/api/files/presign";
const METADATA_URL = "/api/files/metadata";
const FILE_NAME = "hello.txt";
const FILE_CONTENT = "hello dms files";
const FILE_MIMETYPE = "text/plain";
const IMAGE_MIMETYPE = "image/png";
const FILE_SIZE = Buffer.byteLength(FILE_CONTENT);
const OVERSIZE_BYTES = DEFAULT_MAX_UPLOAD_SIZE + 1;
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const AUTH_REJECT_STATUSES = [HTTP_UNAUTHORIZED, HTTP_FORBIDDEN];

describe("[integration] files/presign auth", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects an unauthenticated presign request", async () => {
    const client = createClient();
    const response = await client.post(PRESIGN_URL, {
      filename: FILE_NAME,
      size: FILE_SIZE,
      mimetype: FILE_MIMETYPE,
    });

    expect(response.status).to.be.oneOf(AUTH_REJECT_STATUSES);
  });

  it("rejects an unauthenticated metadata request", async () => {
    const client = createClient();
    const response = await client.get(METADATA_URL, {
      params: { resourceKey: "some-key" },
    });

    expect(response.status).to.be.oneOf(AUTH_REJECT_STATUSES);
  });
});

describe("[integration] files/upload (authenticated tenant member)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("presigns and uploads a staged file through a registered component", async () => {
    const user = await registerUser({ owner: true });
    const client = authorizedClient(user.accessToken);

    const presignResponse = await client.post(PRESIGN_URL, {
      filename: FILE_NAME,
      size: FILE_SIZE,
      mimetype: FILE_MIMETYPE,
      uploadToken: await nativeUploadToken(client),
    });
    expect(presignResponse.status).to.equal(HTTP_OK);
    const presign = presignResponse.data;

    const uploadResponse = await axios.put(
      presign.uploadUrl,
      Buffer.from(FILE_CONTENT),
      {
        headers: presign.headers,
        validateStatus: () => true,
        transformRequest: [(data) => data],
      },
    );
    expect(uploadResponse.status).to.equal(HTTP_OK);

    const metadataResponse = await client.get(METADATA_URL, {
      params: { resourceKey: presign.resourceKey },
    });
    expect(metadataResponse.status).to.equal(HTTP_OK);
  });

  it("rejects a presign with a missing or invalid upload token with 403", async () => {
    const user = await registerUser();
    const client = authorizedClient(user.accessToken);

    const response = await client.post(PRESIGN_URL, {
      filename: FILE_NAME,
      size: FILE_SIZE,
      mimetype: FILE_MIMETYPE,
      uploadToken: "not-a-valid-signed-token",
    });

    expect(response.status).to.equal(HTTP_FORBIDDEN);
  });

  it("rejects a presign whose declared size exceeds the global max with 400", async () => {
    const user = await registerUser({ owner: true });
    const client = authorizedClient(user.accessToken);

    const response = await client.post(PRESIGN_URL, {
      filename: FILE_NAME,
      size: OVERSIZE_BYTES,
      mimetype: FILE_MIMETYPE,
      uploadToken: await nativeUploadToken(client),
    });

    expect(response.status).to.equal(400);
  });

  it("rejects an upload whose content-type does not match with 403", async () => {
    const user = await registerUser({ owner: true });
    const client = authorizedClient(user.accessToken);

    const presignResponse = await client.post(PRESIGN_URL, {
      filename: FILE_NAME,
      size: FILE_SIZE,
      mimetype: FILE_MIMETYPE,
      uploadToken: await nativeUploadToken(client),
    });
    const presign = presignResponse.data;

    const status = await axios
      .put(presign.uploadUrl, Buffer.from(FILE_CONTENT), {
        headers: { ...presign.headers, "Content-Type": IMAGE_MIMETYPE },
        validateStatus: () => true,
        transformRequest: [(data) => data],
      })
      .then((response) => response.status);

    expect(status).to.equal(HTTP_FORBIDDEN);
  });
});
