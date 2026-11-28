import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { CollaborationSubject } from "@antelopejs/interface-dms/notifications";
import type { NotificationTone } from "@antelopejs/interface-dms/notifications/types";
import { z } from "zod";
import {
  emitNotificationToEach,
  type NotificationDelivery,
  type NotificationTemplate,
  recipientsExcept,
} from "../utils";
import type { MockupAnnotation } from "./annotations";
import type { StoredReply } from "./annotations-file";
import { defaultMockupsDir } from "./files";
import type { MockupName } from "./model";
import type { MockupReviewer } from "./review";
import { readSpecSource } from "./source";

/** How much of a note or a reply a notification quotes, in graphemes. */
const EXCERPT_LENGTH = 120;
const ELLIPSIS = "…";
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** A spec's `title`, as a notification names the mockup: a non-empty string. */
const titleSchema = z.string().min(1);

/** What a notification about a note interpolates. */
type NoteParams = NonNullable<NotificationDelivery["params"]>;

/** The note a notification is about, in the mockup it is pinned on. */
export interface NotedMockup {
  name: MockupName;
  /** The mockup's title, when its spec has one: the notification names the mockup by it. */
  title: string | undefined;
  note: MockupAnnotation;
}

function template(
  messageId: string,
  icon: string,
  noted: NotedMockup,
  tone: NotificationTone,
): NotificationTemplate {
  const page =
    noted.note.page === undefined
      ? ""
      : `&page=${encodeURIComponent(noted.note.page)}`;
  return {
    icon,
    subject: CollaborationSubject,
    messageId,
    linkTo: `/mockup?name=${encodeURIComponent(noted.name)}${page}`,
    tone,
  };
}

/** The first line of `text`, cut to {@link EXCERPT_LENGTH} graphemes. */
export function excerptOf(text: string): string {
  const [line = ""] = text.trim().split("\n");
  const parts = [...graphemes.segment(line)].map(({ segment }) => segment);
  return parts.length > EXCERPT_LENGTH
    ? `${parts.slice(0, EXCERPT_LENGTH - 1).join("")}${ELLIPSIS}`
    : line;
}

/** The title of a mockup's spec, or undefined when it has none or the spec does not read. */
export async function mockupTitle(
  name: MockupName,
  mockupsDir = defaultMockupsDir(),
): Promise<string | undefined> {
  const title = titleSchema.safeParse(
    (await readSpecSource(mockupsDir, name))?.spec?.title,
  );
  return title.success ? title.data : undefined;
}

async function platformOwnerIds(): Promise<string[]> {
  const owners = await GetModel(UserModel).getOwners();
  return owners.map((owner) => owner._id);
}

/** Who follows a note: its author and everyone who replied, each once. */
export function participantIds(note: MockupAnnotation): string[] {
  const ids = note.replies.map((reply) => reply.author.userId);
  if (note.author) ids.unshift(note.author.userId);
  return [...new Set(ids)];
}

function paramsOf(
  noted: NotedMockup,
  text: string,
  actor?: MockupReviewer,
): NoteParams {
  const mockup = noted.title ?? noted.name;
  const excerpt = excerptOf(text);
  return actor
    ? { mockup, text: excerpt, actor: actor.name }
    : { mockup, text: excerpt };
}

/** Sends a notification about a note; a failure is logged, as the comment it reports is already written. */
async function tell(
  recipients: string[],
  what: NotificationTemplate,
  params: NoteParams,
  titleKey?: string,
): Promise<void> {
  if (recipients.length === 0) return;
  try {
    await emitNotificationToEach(recipients, what, { params, titleKey });
  } catch (error) {
    Logging.Error(
      `[DMS] Could not tell about a comment on mockup "${params.mockup}": ${String(error)}`,
    );
  }
}

/** The platform owners, except `actor`, who hear of what a reviewer writes. */
async function ownersExcept(actor: MockupReviewer): Promise<string[]> {
  try {
    return recipientsExcept(await platformOwnerIds(), [actor.userId]);
  } catch (error) {
    Logging.Error(
      `[DMS] Could not list the platform owners to tell of a comment: ${String(error)}`,
    );
    return [];
  }
}

/**
 * Tells the platform owners a reviewer pinned a note. The owner's own notes
 * tell nobody: the agent reads them through the tools.
 */
export async function notifyNoteLeft(
  noted: NotedMockup,
  actor: MockupReviewer,
): Promise<void> {
  if (actor.role === "owner") return;
  await tell(
    await ownersExcept(actor),
    template("mockup_comment", "i-ph-chat-circle-dots", noted, "primary"),
    paramsOf(noted, noted.note.text, actor),
  );
}

/**
 * Tells who follows the note, and the platform owners when a reviewer wrote
 * it, that `reply` was left under it. The actor hears nothing.
 */
export async function notifyReplyLeft(
  noted: NotedMockup,
  reply: StoredReply,
  actor: MockupReviewer,
): Promise<void> {
  const owners = actor.role === "owner" ? [] : await ownersExcept(actor);
  const recipients = recipientsExcept(
    [...participantIds(noted.note), ...owners],
    [actor.userId],
  );
  await tell(
    recipients,
    template("mockup_reply", "i-ph-chat-centered-text", noted, "neutral"),
    paramsOf(noted, reply.text, actor),
  );
}

/**
 * Tells who follows the note that it was resolved, by `actor`, or by the AI
 * when none is given. The actor hears nothing.
 */
export async function notifyNoteResolved(
  noted: NotedMockup,
  actor: MockupReviewer | undefined,
): Promise<void> {
  const recipients = recipientsExcept(participantIds(noted.note), [
    actor?.userId,
  ]);
  await tell(
    recipients,
    template("mockup_comment_resolved", "i-ph-check-circle", noted, "success"),
    paramsOf(noted, noted.note.text, actor),
    actor ? undefined : "title_ai",
  );
}
