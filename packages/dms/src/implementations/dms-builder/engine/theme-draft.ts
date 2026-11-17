import type {
  ThemeDraft,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";

const TextByName = z.record(z.string());

const UploadSchema = z.object({
  slot: z.string(),
  mode: z.string(),
  contentType: z.string(),
  base64Content: z.string(),
});

const ThemeDraftSchema = z.object({
  variables: z.object({
    shared: TextByName.optional(),
    light: TextByName.optional(),
    dark: TextByName.optional(),
  }),
  colors: TextByName.optional(),
  logos: z.record(TextByName).optional(),
  uploads: z.array(UploadSchema).optional(),
});

function pointerOf(path: (string | number)[]): string {
  return path.map((segment) => `/${segment}`).join("");
}

/**
 * Issues where the draft does not match `ThemeDraft`: one sent over HTTP is
 * arbitrary JSON, and a wrong type would otherwise fail deep in the write as
 * a server error. `colors`, `logos` and `uploads` may be absent here.
 */
export function themeDraftIssues(draft: ThemeDraft): ValidationIssue[] {
  const parsed = ThemeDraftSchema.safeParse(draft);
  if (parsed.success) {
    return [];
  }
  return parsed.error.issues.map((issue) => ({
    pointer: pointerOf(issue.path),
    message: issue.message,
  }));
}
