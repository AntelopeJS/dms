import axios, { type AxiosInstance } from "axios";
import { expect } from "chai";
import type { PageLayout } from "@antelopejs/interface-dms/page";
import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view";
import type { createAttachmentUpload, readAttachment } from "../../attachments";
import { signUploadToken, type UploadTokenClaims } from "../../utils";

const PRESIGN_URL = "/api/files/presign";
const HTTP_OK = 200;

/** Body of a successful `POST /api/files/presign`, as the route returns it. */
export type PresignResponse = Awaited<
  ReturnType<typeof createAttachmentUpload>
>;

/** Body of a successful `GET /api/files/metadata`, as the route returns it. */
export type AttachmentMetadata = Awaited<ReturnType<typeof readAttachment>>;

/** Page layout of a TableView page, as `GET /dms/pagelayout` serves it. */
export type TableLayout = PageLayout<TableViewOptionsSerialized>;

/** Body of a successful write on the native attachment test controller. */
export interface SavedDocument {
  _id: string;
}

/** Obtain the real server-generated field token rather than bypassing page registration. */
export async function nativeUploadToken(
  client: AxiosInstance,
  field = "file",
  mode = "new",
  slug = "/nativefiles",
): Promise<string> {
  const response = await client.get<TableLayout>("/dms/pagelayout", {
    params: { slug },
  });
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  const form = response.data.components.content.options?.formComponents[mode];
  const token = findUploadToken(form, `/api/native-attachments#${field}`);
  if (!token) throw new Error(`No upload token for ${mode}/${field}`);
  return token;
}

export function findUploadToken(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This recursive layout boundary visits arbitrary JSON leaves; a component-owner type excludes primitive and array children.
  value: unknown,
  field: string,
): string | undefined {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Layout children include primitive leaves; owner-derived component types cannot narrow recursively mixed JSON.
  if (!value || typeof value !== "object") return undefined;
  if (
    "attachmentField" in value &&
    value.attachmentField === field &&
    "uploadToken" in value &&
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The upload token comes from layout JSON; the property existence checks alone do not establish a string.
    typeof value.uploadToken === "string"
  )
    return value.uploadToken;
  return Object.values(value)
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
  const response = await client.post<PresignResponse>(PRESIGN_URL, {
    filename,
    size: content.byteLength,
    mimetype,
    uploadToken: token || signUploadToken(claims),
  });
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  const upload = response.data;
  const uploaded = await axios.put(upload.uploadUrl, content, {
    headers: upload.headers,
    validateStatus: () => true,
    transformRequest: [(data: Buffer) => data],
  });
  expect(uploaded.status, JSON.stringify(uploaded.data)).to.equal(HTTP_OK);
  return {
    key: upload.resourceKey,
    uploadUrl: upload.uploadUrl,
    headers: upload.headers,
  };
}
