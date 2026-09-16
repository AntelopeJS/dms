import {
  Context,
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assertValidation } from "@antelopejs/interface-api-util";
import { AuthTenantMember } from "@antelopejs/interface-dms/guards";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { readAttachment } from "../attachments/read";
import { createAttachmentUpload } from "../attachments/uploads";
import { isUploadValidationError } from "../utils/upload-constraints";
import { verifyUploadToken } from "../utils/upload-token";
import {
  metadataQuerySchema,
  presignBodySchema,
} from "../validation/file.schema";

const UPLOAD_REJECTED_STATUS = 400;
const UPLOAD_TOKEN_REJECTED_STATUS = 403;

export class FilesController extends Controller("/api/files") {
  @AuthTenantMember()
  declare user: User;

  @Post("/presign")
  async presign(@Context() context: RequestContext, @JSONBody() body: unknown) {
    const { filename, size, mimetype, uploadToken } = assertValidation(
      body,
      (v) => presignBodySchema.parse(v),
    );
    const claims = verifyUploadToken(uploadToken);
    if (!claims?.field) {
      throw new HTTPResult(
        UPLOAD_TOKEN_REJECTED_STATUS,
        "Upload rejected: missing or invalid attachment field token.",
      );
    }
    try {
      return await createAttachmentUpload(
        context,
        {
          filename,
          size,
          mimetype,
          path: claims.path,
          metadata: { filename },
        },
        claims,
      );
    } catch (error) {
      if (isUploadValidationError(error)) {
        throw new HTTPResult(
          UPLOAD_REJECTED_STATUS,
          "Upload rejected: the file exceeds the allowed size or type.",
        );
      }
      throw error;
    }
  }

  @Get("/metadata")
  async getMetadata(
    @Context() context: RequestContext,
    @Parameter("resourceKey", "query") resourceKey: string,
    @Parameter("storage", "query") storage?: string,
  ) {
    const query = assertValidation({ resourceKey, storage }, (value) =>
      metadataQuerySchema.parse(value),
    );
    return readAttachment(context, query.resourceKey, query.storage);
  }
}
