import { z } from "zod";

/** Bound on a role name; the editor mirrors it as the field's `maxLength`. */
export const ROLE_NAME_MAX_LENGTH = 80;

/** Bound on a role description; the editor mirrors it as the field's `maxLength`. */
export const ROLE_DESCRIPTION_MAX_LENGTH = 240;

const ROLE_NAME_REQUIRED_MESSAGE = "$page.settings.roles.error.name_required";

const roleName = z
  .string()
  .trim()
  .min(1, ROLE_NAME_REQUIRED_MESSAGE)
  .max(ROLE_NAME_MAX_LENGTH);

export const roleEditorSchema = z.object({
  name: roleName,
  description: z.string().trim().max(ROLE_DESCRIPTION_MAX_LENGTH).default(""),
  permissions: z.array(z.string().min(1)).default([]),
});

export const roleDuplicateSchema = z.object({
  name: roleName,
});

export const roleDeleteSchema = z.object({
  /** Confirms the deletion of a role that members or invitations still hold. */
  force: z.boolean().default(false),
  /** Role given to the members and invitations of the deleted one. */
  reassignTo: z.string().min(1).optional(),
});

/** Bound on the ids and the page path of a role preview request. */
const ROLE_PREVIEW_ID_MAX_LENGTH = 256;
const ROLE_PREVIEW_MAX_PERMISSIONS = 5000;
const ROLE_PREVIEW_PATH_MAX_LENGTH = 2048;

export const rolePreviewSchema = z.object({
  /** The role's permissions as edited, unsaved changes included. */
  permissions: z
    .array(z.string().min(1).max(ROLE_PREVIEW_ID_MAX_LENGTH))
    .max(ROLE_PREVIEW_MAX_PERMISSIONS)
    .default([]),
  /** Path of the page being previewed; the menu alone when omitted. */
  path: z.string().min(1).max(ROLE_PREVIEW_PATH_MAX_LENGTH).optional(),
});

export type RoleEditorInput = z.infer<typeof roleEditorSchema>;
export type RoleDeleteInput = z.infer<typeof roleDeleteSchema>;
