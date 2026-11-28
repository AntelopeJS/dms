import type { AnnotationPatch, MockupAnnotation } from "./annotations";
import type { NoteAuthor, StoredReply } from "./annotations-file";

/**
 * The permission of the `/mockup` page: a role that holds it opens a mockup
 * read-only and comments on it. The platform owner needs no grant.
 */
export const MOCKUP_REVIEW_PERMISSION_ID = "mockup.review";

/** What a caller of the mockup routes is: the platform owner, or a member whose role reviews mockups. */
export type MockupRole = "owner" | "reviewer";

/** A caller the mockup routes serve: who they are, and what they may do. */
export interface MockupReviewer extends NoteAuthor {
  role: MockupRole;
}

/** What `GET /api/mockup/:name/access` answers the viewer: its role, and who it is to the notes. */
export type MockupAccess = MockupReviewer;

/** The author a note or a reply stores for `reviewer`. */
export function authorOf(reviewer: MockupReviewer): NoteAuthor {
  return { userId: reviewer.userId, name: reviewer.name };
}

/** Whether `reviewer` wrote `note`: a note written before authors is nobody's. */
export function isOwnNote(
  reviewer: MockupReviewer,
  note: Pick<MockupAnnotation, "author">,
): boolean {
  return note.author?.userId === reviewer.userId;
}

/**
 * Whether `reviewer` may apply `patch` to `note`: the owner changes any note;
 * a reviewer resolves and reopens any note, and rewrites or moves only their
 * own.
 */
export function mayChangeNote(
  reviewer: MockupReviewer,
  note: Pick<MockupAnnotation, "author">,
  patch: AnnotationPatch,
): boolean {
  if (reviewer.role === "owner") return true;
  const rewrites = patch.text !== undefined || patch.place !== undefined;
  return !rewrites || isOwnNote(reviewer, note);
}

/** Whether `reviewer` may delete `note`: the owner any, a reviewer their own. */
export function mayDeleteNote(
  reviewer: MockupReviewer,
  note: Pick<MockupAnnotation, "author">,
): boolean {
  return reviewer.role === "owner" || isOwnNote(reviewer, note);
}

/** Whether `reviewer` may delete `reply`: the owner any, a reviewer their own. */
export function mayDeleteReply(
  reviewer: MockupReviewer,
  reply: Pick<StoredReply, "author">,
): boolean {
  return reviewer.role === "owner" || reply.author.userId === reviewer.userId;
}
