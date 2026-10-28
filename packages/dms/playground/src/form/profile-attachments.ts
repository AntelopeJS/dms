import type { AttachmentField } from "@antelopejs/interface-dms/attachments";
import type { Profile } from "./profile-database";

type UploadConstraints = NonNullable<AttachmentField["constraints"]>;

const MEGABYTE = 1024 * 1024;

export const AVATAR_ATTACHMENT_FIELD = "playground-profile#avatar";
export const COVER_IMAGE_ATTACHMENT_FIELD = "playground-profile#coverImage";
export const GALLERY_ATTACHMENT_FIELD = "playground-profile#gallery";
export const DOCUMENTS_ATTACHMENT_FIELD = "playground-profile#documents";

/** The avatar is served to anyone holding its URL, without a session. */
export const AVATAR_VISIBILITY = "public";

export const AVATAR_CONSTRAINTS: UploadConstraints = {
  allowedMimetypes: ["image/png", "image/jpeg"],
  maxSize: 5 * MEGABYTE,
};

export const COVER_IMAGE_CONSTRAINTS: UploadConstraints = {
  maxSize: 10 * MEGABYTE,
};

export const GALLERY_CONSTRAINTS: UploadConstraints = {
  allowedMimetypes: ["image/png", "image/jpeg", "image/webp"],
  maxSize: 10 * MEGABYTE,
};

export const DOCUMENTS_CONSTRAINTS: UploadConstraints = {
  allowedMimetypes: ["application/pdf"],
  maxSize: 10 * MEGABYTE,
};

/**
 * Server-side declaration of the profile form's native file fields. The save
 * route validates and promotes against these, never against the client's.
 */
export const PROFILE_ATTACHMENT_FIELDS = [
  {
    id: AVATAR_ATTACHMENT_FIELD,
    key: "avatar",
    kind: "file",
    visibility: AVATAR_VISIBILITY,
    constraints: AVATAR_CONSTRAINTS,
  },
  {
    id: COVER_IMAGE_ATTACHMENT_FIELD,
    key: "coverImage",
    kind: "image",
    constraints: COVER_IMAGE_CONSTRAINTS,
  },
  {
    id: GALLERY_ATTACHMENT_FIELD,
    key: "gallery",
    kind: "image",
    constraints: GALLERY_CONSTRAINTS,
  },
  {
    id: DOCUMENTS_ATTACHMENT_FIELD,
    key: "documents",
    kind: "file",
    constraints: DOCUMENTS_CONSTRAINTS,
  },
] satisfies (AttachmentField & { key: keyof Profile })[];

/** The stored values of the native file fields, as `SaveComponentFiles` compares them. */
export function pickAttachmentValues(profile: Profile) {
  return Object.fromEntries(
    PROFILE_ATTACHMENT_FIELDS.map(({ key }) => [key, profile[key]]),
  );
}
