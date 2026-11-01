import axios, { type AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import type { PageLayout } from "@antelopejs/interface-dms/page";
import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view";
import type { createAttachmentUpload, readAttachment } from "../../attachments";
import { signUploadToken, type UploadTokenClaims } from "../../utils";
import { type BodyResponse, parseBody } from "./parse-body";

const PRESIGN_URL = "/api/files/presign";
const HTTP_OK = 200;

/** Body of a successful `POST /api/files/presign`, as the route returns it. */
export type PresignResponse = Awaited<
  ReturnType<typeof createAttachmentUpload>
>;

/** Body of a successful `GET /api/files/metadata`, as the route returns it. */
export type AttachmentMetadata = Awaited<ReturnType<typeof readAttachment>>;

/** Body of a successful write on the native attachment test controller. */
export interface SavedDocument {
  _id: string;
}

const PresignBody = z.object({
  uploadUrl: z.string(),
  resourceKey: z.string(),
  expiresAt: z.number(),
  headers: z.record(z.string()),
}) satisfies z.ZodType<PresignResponse>;

const AttachmentMetadataBody = z.object({
  resourceKey: z.string(),
  filename: z.string(),
  size: z.number(),
  mimetype: z.string(),
  lastModified: z.number(),
  metadata: z.record(z.string()).optional(),
  url: z.string(),
  expiresAt: z.number().optional(),
}) satisfies z.ZodType<AttachmentMetadata>;

const SavedDocumentBody = z.object({
  _id: z.string(),
}) satisfies z.ZodType<SavedDocument>;

const ComponentBody = z
  .object({ componentName: z.string(), options: z.unknown() })
  .passthrough();

const PageLayoutBody = z
  .object({ components: z.record(ComponentBody) })
  .passthrough() satisfies z.ZodType<PageLayout>;

type FormComponent = NonNullable<
  TableViewOptionsSerialized["formComponents"][string]
>;

interface TableLayoutSlice {
  components: {
    content: {
      componentName: string;
      options?: Pick<TableViewOptionsSerialized, "formPages"> & {
        formComponents: Record<
          string,
          Pick<FormComponent, "componentName"> | undefined
        >;
      };
    };
  };
}

const TableLayoutBody = z.object({
  components: z.object({
    content: z.object({
      componentName: z.string(),
      options: z
        .object({
          formComponents: z.record(ComponentBody.optional()),
          formPages: z
            .object({ new: z.string(), edit: z.string(), view: z.string() })
            .optional(),
        })
        .passthrough()
        .optional(),
    }),
  }),
}) satisfies z.ZodType<TableLayoutSlice>;

/** Parses the answer of `POST /api/files/presign`. */
export function parsePresign(response: BodyResponse): PresignResponse {
  return parseBody(PresignBody, response);
}

/** Parses the answer of `GET /api/files/metadata`. */
export function parseAttachmentMetadata(
  response: BodyResponse,
): AttachmentMetadata {
  return parseBody(AttachmentMetadataBody, response);
}

/** Parses the answer of a write on the native attachment test controller. */
export function parseSavedDocument(response: BodyResponse): SavedDocument {
  return parseBody(SavedDocumentBody, response);
}

/** Parses the page layout of any page. */
export function parsePageLayout(response: BodyResponse): PageLayout {
  return parseBody(PageLayoutBody, response);
}

/** Parses the page layout of a TableView page, as `GET /dms/pagelayout` serves it. */
export function parseTableLayout(response: BodyResponse) {
  return parseBody(TableLayoutBody, response);
}

/** Downloads a stored file from its read URL and checks it came back as text. */
export async function fetchStoredText(url: string): Promise<string> {
  return parseBody(z.string(), await axios.get(url));
}

/** Obtain the real server-generated field token rather than bypassing page registration. */
export async function nativeUploadToken(
  client: AxiosInstance,
  field = "file",
  mode = "new",
  slug = "/nativefiles",
): Promise<string> {
  const response = await client.get("/dms/pagelayout", {
    params: { slug },
  });
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  const { options } = parseTableLayout(response).components.content;
  if (!options) throw new Error(`No table options on ${slug}`);
  const form = options.formComponents[mode];
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
  const response = await client.post(PRESIGN_URL, {
    filename,
    size: content.byteLength,
    mimetype,
    uploadToken: token || signUploadToken(claims),
  });
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  const upload = parsePresign(response);
  const uploaded = await axios.put(upload.uploadUrl, content, {
    headers: upload.headers,
    validateStatus: () => true,
    transformRequest: [],
  });
  expect(uploaded.status, JSON.stringify(uploaded.data)).to.equal(HTTP_OK);
  return {
    key: upload.resourceKey,
    uploadUrl: upload.uploadUrl,
    headers: upload.headers,
  };
}
