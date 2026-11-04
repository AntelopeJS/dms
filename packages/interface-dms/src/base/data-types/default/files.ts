/** Stable rich-text, time and file data types. @packageDocumentation */
import {
  GetFileMetadata,
  type UploadConstraints,
} from "@antelopejs/interface-file-storage";
import { z } from "zod";
import { GetAttachmentValidationMetadata } from "../../../attachments";
import { FormComponents } from "../../form-schema";
import { DataType, RegisterDataType } from "../core";
import { DefaultDataCompareTypes } from "../compare-types";
import { RichTextTypeOptions, StringTimeTypeOptions } from "./options";
import type { ImageValue } from "../../../types";

/**
 * The `rich_text` data type.
 *
 * @docsApi
 */
@RegisterDataType("rich_text")
export class RichTextType extends DataType {
  constructor(public readonly options: RichTextTypeOptions = {}) {
    super([], undefined, options);
  }

  protected defaultInputComponent() {
    return FormComponents.RichText({
      placeholder: this.options.placeholder,
    });
  }

  getValidation() {
    return z.string();
  }
}

/**
 * The `string_time` data type.
 *
 * @docsApi
 */
@RegisterDataType("string_time")
export class StringTimeType extends DataType {
  constructor(public readonly options: StringTimeTypeOptions = {}) {
    super(
      [
        DefaultDataCompareTypes.Is,
        DefaultDataCompareTypes.IsNot,
        DefaultDataCompareTypes.GreaterThan,
        DefaultDataCompareTypes.GreaterThanOrEqualTo,
        DefaultDataCompareTypes.LessThan,
        DefaultDataCompareTypes.LessThanOrEqualTo,
        DefaultDataCompareTypes.IsEmpty,
        DefaultDataCompareTypes.IsNotEmpty,
      ],
      DefaultDataCompareTypes.Is,
      options,
    );
  }

  protected defaultInputComponent() {
    return FormComponents.InputTime({
      placeholder: this.options.placeholder,
      min: this.options.min,
      max: this.options.max,
    });
  }

  getValidation() {
    let schema = z.number();

    if (this.options.min !== undefined) {
      schema = schema.min(this.options.min);
    }

    if (this.options.max !== undefined) {
      schema = schema.max(this.options.max);
    }

    return schema;
  }
}

export interface FileTypeOptions extends Record<string, unknown> {
  multiple?: boolean;
  constraints?: UploadConstraints;
  path?: string;
  storage?: string;
  fallback?: string;
  attachmentField?: string;
  visibility?: "private" | "public";
}

function matchMimetype(actual: string, pattern: string): boolean {
  if (pattern === actual) return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);
    return actual.startsWith(prefix);
  }
  return false;
}

const MISSING_FILE_ERROR_PATTERN = /not\s?found|nosuchkey/i;

/**
 * A missing referenced file is a validation failure (the submitted key does
 * not point at a real upload); any other metadata error (storage outage,
 * auth) keeps propagating so it surfaces as a server error, not as a bogus
 * "invalid input" on the field.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Thrown values.
function isMissingFileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return MISSING_FILE_ERROR_PATTERN.test(message);
}

function createFileValidationSchema(
  constraints?: UploadConstraints,
  storage?: string,
  attachmentField?: string,
) {
  return z.string().refine(
    async (resourceKey) => {
      if (!constraints && !attachmentField) return true;
      if (!resourceKey) return true;

      const getMetadata = attachmentField
        ? GetAttachmentValidationMetadata
        : GetFileMetadata;
      const metadata = await getMetadata(resourceKey, storage).catch(
        (error: unknown) => {
          if (isMissingFileError(error)) return null;
          throw error;
        },
      );
      if (metadata === null) {
        return attachmentField !== undefined;
      }
      if (!metadata) {
        return false;
      }

      if (constraints?.maxSize && metadata.size > constraints.maxSize) {
        return false;
      }

      if (constraints?.allowedMimetypes?.length) {
        const isAllowed = constraints.allowedMimetypes.some((pattern) =>
          matchMimetype(metadata.mimetype, pattern),
        );
        if (!isAllowed) return false;
      }

      return true;
    },
    { message: "File does not meet constraints" },
  );
}

/**
 * The `file` data type.
 *
 * @docsApi
 */
@RegisterDataType("file")
export class FileType extends DataType {
  constructor(public readonly options: FileTypeOptions = {}) {
    super([], undefined, options);
  }

  protected defaultInputComponent() {
    return FormComponents.File({
      multiple: this.options.multiple,
      constraints: this.options.constraints,
      path: this.options.path,
      storage: this.options.storage,
      attachmentField: this.options.attachmentField,
      visibility: this.options.visibility,
    });
  }

  getValidation() {
    const fileSchema = z.lazy(() =>
      createFileValidationSchema(
        this.options.constraints,
        this.options.storage,
        this.options.attachmentField,
      ),
    );

    if (this.options.multiple) {
      return z.array(fileSchema);
    }

    return fileSchema;
  }
}

export type { ImageValue };

export interface ImageTypeOptions extends Record<string, unknown> {
  multiple?: boolean;
  max?: number;
  constraints?: UploadConstraints;
  path?: string;
  storage?: string;
  resize?: FormComponents.ImageResizeOptions;
  attachmentField?: string;
  visibility?: "private" | "public";
}

const DEFAULT_IMAGE_MIMETYPES = ["image/*"];

function resolveImageConstraints(
  constraints?: UploadConstraints,
): UploadConstraints {
  return {
    ...constraints,
    allowedMimetypes: constraints?.allowedMimetypes?.length
      ? constraints.allowedMimetypes
      : DEFAULT_IMAGE_MIMETYPES,
  };
}

function createImageValueSchema(
  constraints: UploadConstraints,
  storage?: string,
  attachmentField?: string,
) {
  return z.object({
    key: createFileValidationSchema(constraints, storage, attachmentField),
    alt: z.string().optional(),
    principal: z.boolean().optional(),
  });
}

function hasAtMostOnePrincipal(images: ImageValue[]): boolean {
  return images.filter((image) => image.principal).length <= 1;
}

/**
 * The `image` data type.
 *
 * @docsApi
 */
@RegisterDataType("image")
export class ImageType extends DataType {
  constructor(public readonly options: ImageTypeOptions = {}) {
    super([], undefined, options);
  }

  protected defaultInputComponent() {
    return FormComponents.Image({
      multiple: this.options.multiple,
      max: this.options.max,
      constraints: resolveImageConstraints(this.options.constraints),
      path: this.options.path,
      storage: this.options.storage,
      resize: this.options.resize,
      attachmentField: this.options.attachmentField,
      visibility: this.options.visibility,
    });
  }

  getValidation() {
    const imageSchema = z.lazy(() =>
      createImageValueSchema(
        resolveImageConstraints(this.options.constraints),
        this.options.storage,
        this.options.attachmentField,
      ),
    );

    if (!this.options.multiple) {
      return imageSchema;
    }

    const arraySchema =
      this.options.max !== undefined
        ? z.array(imageSchema).max(this.options.max)
        : z.array(imageSchema);

    return arraySchema.refine(hasAtMostOnePrincipal, {
      message: "Only one image can be marked as principal",
    });
  }
}
