import {
  Controller,
  Delete,
  Get,
  HTTPResult,
  JSONBody,
  Parameter,
  Post,
  Route,
} from "@antelopejs/interface-api";
import type { z } from "zod";
import {
  addReply,
  annotationDraftSchema,
  annotationPatchSchema,
  createAnnotation,
  deleteAnnotation,
  deleteReply,
  listAnnotations,
  type MockupAnnotation,
  type PlacementRefusal,
  readAnnotation,
  replyDraftSchema,
  updateAnnotation,
} from "./annotations";
import type { StoredReply } from "./annotations-file";
import { MOCKUP_API } from "./fixtures";
import { annotationIdSchema, type MockupName, parseMockupName } from "./model";
import { MockupOwnerController } from "./owner-controller";
import { forbidden, notFound } from "./refusals";
import {
  authorOf,
  mayChangeNote,
  mayDeleteNote,
  mayDeleteReply,
  type MockupAccess,
} from "./review";
import {
  mockupTitle,
  type NotedMockup,
  notifyNoteLeft,
  notifyNoteResolved,
  notifyReplyLeft,
} from "./review-notifications";
import { readSpecText } from "./source";

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;

/** Refuses any name that is not a mockup directory name, before any path is built. */
function nameOf(raw: string): MockupName {
  const name = parseMockupName(raw);
  if (!name) throw notFound("mockup");
  return name;
}

/** The body of a request parsed by `schema`, or the 400 that refuses it. */
function bodyOf<Body>(schema: z.ZodType<Body>, body: unknown): Body {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPResult(HTTP_BAD_REQUEST, { message: parsed.error.message });
  }
  return parsed.data;
}

/** The refusal a creation or an update that changed no annotation answers with. */
function refusal(
  refused:
    | PlacementRefusal
    | { kind: "no_mockup" }
    | { kind: "no_annotation" }
    | { kind: "no_reply" },
): HTTPResult {
  switch (refused.kind) {
    case "no_mockup":
      return notFound("mockup");
    case "no_annotation":
      return notFound("annotation");
    case "no_reply":
      return notFound("reply");
    case "no_node":
      return notFound("pageNode");
    case "ambiguous":
      return new HTTPResult(HTTP_CONFLICT, {
        message: "$dms.refusals.mockup.note_ambiguous_ids",
      });
    case "spec_invalid":
      return new HTTPResult(HTTP_CONFLICT, {
        message: "$dms.refusals.mockup.note_spec_invalid",
        errors: refused.errors.map(({ path, message }) => ({ path, message })),
      });
  }
}

/** The note `rawId` of the mockup `name`, or the 404 that refuses the id or the missing note. */
async function noteOf(
  mockupsDir: string,
  name: MockupName,
  rawId: string,
): Promise<{ id: string; note: MockupAnnotation }> {
  const id = annotationIdSchema.safeParse(rawId);
  if (!id.success) throw notFound("annotation");
  const note = await readAnnotation(name, id.data, mockupsDir);
  if (!note) throw notFound("annotation");
  return { id: id.data, note };
}

/** The reply `rawId` under `note`, or the 404 that refuses the id or the missing reply. */
function replyOf(note: MockupAnnotation, rawId: string): StoredReply {
  const id = annotationIdSchema.safeParse(rawId);
  const reply = id.success
    ? note.replies.find((entry) => entry.id === id.data)
    : undefined;
  if (!reply) throw notFound("reply");
  return reply;
}

/** `note` in the mockup `name`, as a notification names it. */
async function noted(
  mockupsDir: string,
  name: MockupName,
  note: MockupAnnotation,
): Promise<NotedMockup> {
  return { name, title: await mockupTitle(name, mockupsDir), note };
}

/** `GET :name/access`: who the caller is to the mockup, once it exists. */
function registerAccessRoute(mockupsDir: string) {
  class MockupAccessController extends Controller(
    MOCKUP_API,
    MockupOwnerController,
  ) {
    /** The owner, who edits, or a reviewer, who comments; and the user their notes carry. */
    @Get(":name/access")
    async access(@Parameter("name") rawName: string): Promise<MockupAccess> {
      const reviewer = await this.reviewer();
      if ((await readSpecText(mockupsDir, nameOf(rawName))) === undefined) {
        throw notFound("mockup");
      }
      return reviewer;
    }
  }
  return MockupAccessController;
}

/**
 * The annotation routes over the mockups of `mockupsDir`. The owner and the
 * reviewers read and pin notes alike, and every note carries its author. A
 * reviewer resolves and reopens any note, and rewrites, moves or deletes only
 * what they wrote; the owner anything. A reviewer's note tells the platform
 * owners, and a resolution tells the people on the note, never the one who
 * acted.
 */
function registerAnnotationRoutes(mockupsDir: string) {
  class MockupAnnotationController extends Controller(
    MOCKUP_API,
    MockupOwnerController,
  ) {
    @Get(":name/annotations")
    async annotations(
      @Parameter("name") rawName: string,
    ): Promise<{ annotations: MockupAnnotation[] }> {
      await this.assertReviewer();
      const annotations = await listAnnotations(nameOf(rawName), mockupsDir);
      if (!annotations) throw notFound("mockup");
      return { annotations };
    }

    @Post(":name/annotations")
    async create(
      @Parameter("name") rawName: string,
      @JSONBody() body: unknown,
    ): Promise<MockupAnnotation> {
      const by = await this.reviewer();
      const name = nameOf(rawName);
      const draft = bodyOf(annotationDraftSchema, body);
      const created = await createAnnotation(
        name,
        draft,
        mockupsDir,
        authorOf(by),
      );
      if (created.kind !== "created") throw refusal(created);
      await notifyNoteLeft(
        await noted(mockupsDir, name, created.annotation),
        by,
      );
      return created.annotation;
    }

    @Route("handler", "patch", ":name/annotations/:id")
    async update(
      @Parameter("name") rawName: string,
      @Parameter("id") rawId: string,
      @JSONBody() body: unknown,
    ): Promise<MockupAnnotation> {
      const by = await this.reviewer();
      const name = nameOf(rawName);
      const patch = bodyOf(annotationPatchSchema, body);
      const { id, note } = await noteOf(mockupsDir, name, rawId);
      if (!mayChangeNote(by, note, patch)) throw forbidden("note");
      const updated = await updateAnnotation(
        name,
        id,
        patch,
        mockupsDir,
        authorOf(by),
      );
      if (updated.kind !== "updated") throw refusal(updated);
      if (note.status === "open" && updated.annotation.status === "resolved") {
        await notifyNoteResolved(
          await noted(mockupsDir, name, updated.annotation),
          by,
        );
      }
      return updated.annotation;
    }

    @Delete(":name/annotations/:id")
    async remove(
      @Parameter("name") rawName: string,
      @Parameter("id") rawId: string,
    ): Promise<{ id: string }> {
      const by = await this.reviewer();
      const name = nameOf(rawName);
      const { id, note } = await noteOf(mockupsDir, name, rawId);
      if (!mayDeleteNote(by, note)) throw forbidden("note");
      if (!(await deleteAnnotation(name, id, mockupsDir))) {
        throw notFound("annotation");
      }
      return { id };
    }
  }
  return MockupAnnotationController;
}

/**
 * The reply routes under the annotations of `mockupsDir`. Anyone the routes
 * serve replies under any note; a reply is deleted by its author and the
 * owner. A reply tells the people on the note, and the platform owners when
 * a reviewer wrote it, never the one who acted.
 */
function registerReplyRoutes(mockupsDir: string) {
  class MockupReplyController extends Controller(
    MOCKUP_API,
    MockupOwnerController,
  ) {
    @Post(":name/annotations/:id/replies")
    async reply(
      @Parameter("name") rawName: string,
      @Parameter("id") rawId: string,
      @JSONBody() body: unknown,
    ): Promise<MockupAnnotation> {
      const by = await this.reviewer();
      const name = nameOf(rawName);
      const draft = bodyOf(replyDraftSchema, body);
      const { id } = await noteOf(mockupsDir, name, rawId);
      const replied = await addReply(name, id, draft, authorOf(by), mockupsDir);
      if (replied.kind !== "replied") throw refusal(replied);
      await notifyReplyLeft(
        await noted(mockupsDir, name, replied.annotation),
        replied.reply,
        by,
      );
      return replied.annotation;
    }

    @Delete(":name/annotations/:id/replies/:replyId")
    async removeReply(
      @Parameter("name") rawName: string,
      @Parameter("id") rawId: string,
      @Parameter("replyId") rawReplyId: string,
    ): Promise<MockupAnnotation> {
      const by = await this.reviewer();
      const name = nameOf(rawName);
      const { id, note } = await noteOf(mockupsDir, name, rawId);
      const reply = replyOf(note, rawReplyId);
      if (!mayDeleteReply(by, reply)) throw forbidden("reply");
      const deleted = await deleteReply(name, id, reply.id, mockupsDir);
      if (deleted.kind !== "deleted") throw refusal(deleted);
      return deleted.annotation;
    }
  }
  return MockupReplyController;
}

/**
 * The routes a reviewer reaches as the owner does: who they are to a mockup,
 * and its comments and replies. Registered with the rest of the mockup API,
 * in development only.
 */
export function registerReviewRoutes(mockupsDir: string): void {
  registerAccessRoute(mockupsDir);
  registerAnnotationRoutes(mockupsDir);
  registerReplyRoutes(mockupsDir);
}
