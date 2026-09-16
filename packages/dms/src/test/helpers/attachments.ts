import axios, { type AxiosInstance } from "axios";
import { expect } from "chai";
import {
  signUploadToken,
  type UploadTokenClaims,
} from "../../utils/upload-token";

const PRESIGN_URL = "/api/files/presign";
const HTTP_OK = 200;

/** Obtain the real server-generated field token rather than bypassing page registration. */
export async function nativeUploadToken(
  client: AxiosInstance,
  field = "file",
  mode = "new",
): Promise<string> {
  const response = await client.get("/dms/pagelayout", {
    params: { slug: "/nativefiles" },
  });
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  const form = response.data.components.content.options.formComponents[mode];
  const token = findUploadToken(form, `/api/native-attachments#${field}`);
  if (!token) throw new Error(`No upload token for ${mode}/${field}`);
  return token;
}

export function findUploadToken(
  value: unknown,
  field: string,
): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const node = value as Record<string, unknown>;
  if (node.attachmentField === field && typeof node.uploadToken === "string")
    return node.uploadToken;
  return Object.values(node)
    .map((child) => findUploadToken(child, field))
    .find(Boolean);
}

export interface UploadedAttachment {
  key: string;
  uploadUrl: string;
  headers: Record<string, string>;
}

export interface UploadAttachmentRequest {
  client: AxiosInstance;
  content: Buffer;
  mimetype: string;
  claims: UploadTokenClaims;
  filename?: string;
  token?: string;
}

export async function uploadAttachment(
  request: UploadAttachmentRequest,
): Promise<UploadedAttachment> {
  const {
    client,
    content,
    mimetype,
    claims,
    filename = "attachment.txt",
    token,
  } = request;
  const response = await client.post(PRESIGN_URL, {
    filename,
    size: content.byteLength,
    mimetype,
    uploadToken: token || signUploadToken(claims),
  });
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  const upload = response.data as UploadedAttachment & { resourceKey: string };
  const uploaded = await axios.put(upload.uploadUrl, content, {
    headers: upload.headers,
    validateStatus: () => true,
    transformRequest: [(data) => data],
  });
  expect(uploaded.status, JSON.stringify(uploaded.data)).to.equal(HTTP_OK);
  return {
    key: upload.resourceKey,
    uploadUrl: upload.uploadUrl,
    headers: upload.headers,
  };
}
