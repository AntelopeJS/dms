import {
  Context,
  Controller,
  Delete,
  HTTPResult,
  JSONBody,
  Parameter,
  Put,
  type RequestContext,
} from "@antelopejs/interface-api";
import { z } from "zod";
import { anchorPointer, locateBlock } from "./anchor";
import { parseSpec } from "./compile";
import { MOCKUP_API } from "./fixtures";
import { parseMockupName } from "./model";
import { MockupOwnerController } from "./owner-controller";
import type { PresenceBoard } from "./presence-board";
import {
  type Acquisition,
  parseViewerId,
  type ViewerId,
  viewerIdSchema,
} from "./presence";
import { readSpecText, withSpecLock } from "./source";

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const MAX_POINTER = 2048;

const lockBodySchema = z
  .object({
    viewer: viewerIdSchema,
    /** The spec JSON pointer of the node the viewer is about to edit. */
    path: z
      .string()
      .max(MAX_POINTER)
      .regex(/^(?:\/[^/]*)*$/),
  })
  .strict();

/** What taking or freeing a lock answers when it worked. */
export interface LockAnswer {
  ok: true;
}

function notFound(what: string): HTTPResult {
  return new HTTPResult(HTTP_NOT_FOUND, { message: `${what} not found` });
}

function notOnMockup(): HTTPResult {
  return new HTTPResult(HTTP_FORBIDDEN, {
    message: "this viewer has no event stream open on the mockup",
  });
}

/** What the lock routes answer when they refuse. */
type Refusal =
  | Exclude<Acquisition, { kind: "granted" }>
  | { kind: "no_mockup" }
  | { kind: "ambiguous" }
  | { kind: "spec_invalid"; errors: Array<{ path: string; message: string }> };

function refused(refusal: Refusal): HTTPResult {
  switch (refusal.kind) {
    case "no_mockup":
      return notFound("mockup");
    case "no_node":
      return notFound("node at this path");
    case "unknown_viewer":
      return notOnMockup();
    case "held":
      return new HTTPResult(HTTP_CONFLICT, {
        message: `${refusal.by} is editing this block`,
        holder: refusal.by,
      });
    case "ambiguous":
      return new HTTPResult(HTTP_CONFLICT, {
        message:
          "another block has the same ids as this one, so a lock cannot tell them apart: give one of them another id",
      });
    case "spec_invalid":
      return new HTTPResult(HTTP_CONFLICT, {
        message: "spec.json is not a valid spec, so the block cannot get an id",
        errors: refusal.errors,
      });
  }
}

/**
 * The routes a `/mockup` viewer takes and frees the lock on a block through.
 * Development only, and platform owners only, like the rest of the mockup
 * API: every viewer is a platform owner, so a lock never widens access.
 */
export function registerPresenceRoutes(
  board: PresenceBoard,
  mockupsDir: string,
) {
  class MockupPresenceController extends Controller(
    MOCKUP_API,
    MockupOwnerController,
  ) {
    /**
     * Takes the lock on the node at `path` for `viewer`, who holds no other
     * after it, or renews the one it holds there. The node gets an id when it
     * has none, as a note pinned on it would give it. Answers 409 with the
     * holder's name while another viewer holds that node, an ancestor of it or
     * a descendant.
     */
    @Put(":name/locks")
    async acquire(
      @Parameter("name") rawName: string,
      @JSONBody() body: unknown,
    ): Promise<LockAnswer> {
      const owner = await this.owner();
      const name = parseMockupName(rawName);
      if (!name) throw notFound("mockup");
      const parsed = lockBodySchema.safeParse(body);
      if (!parsed.success) {
        throw new HTTPResult(HTTP_BAD_REQUEST, {
          message: parsed.error.message,
        });
      }
      const { viewer, path } = parsed.data;
      if (!board.viewerOf(name, viewer, owner.userId)) throw notOnMockup();
      const answer = await withSpecLock(
        mockupsDir,
        name,
        async (_write, stamp): Promise<Refusal | LockAnswer> => {
          const text = await readSpecText(mockupsDir, name);
          if (text === undefined) return { kind: "no_mockup" };
          const read = parseSpec(text);
          if (!read.ok) return { kind: "spec_invalid", errors: read.issues };
          const anchored = anchorPointer(read.spec, path);
          if (!anchored) return { kind: "no_node" };
          if (locateBlock(read.spec, anchored.anchor)?.path !== path) {
            return { kind: "ambiguous" };
          }
          const taken = board.acquire(
            name,
            { id: viewer, userId: owner.userId },
            anchored.anchor,
            read.spec,
          );
          if (taken.kind !== "granted") return taken;
          if (anchored.stamp) {
            try {
              await stamp(text, [anchored.stamp]);
            } catch (error) {
              board.release(name, viewer, owner.userId);
              throw error;
            }
          }
          return { ok: true };
        },
      );
      if ("kind" in answer) throw refused(answer);
      return answer;
    }

    /** Frees the lock `?viewer=` holds, which a viewer does when it saves or leaves a block. */
    @Delete(":name/locks")
    async release(
      @Parameter("name") rawName: string,
      @Context() context: RequestContext,
    ): Promise<LockAnswer> {
      const owner = await this.owner();
      const name = parseMockupName(rawName);
      if (!name) throw notFound("mockup");
      const viewer: ViewerId | undefined = parseViewerId(
        context.url.searchParams.get("viewer"),
      );
      if (!viewer || !board.release(name, viewer, owner.userId)) {
        throw notOnMockup();
      }
      return { ok: true };
    }
  }
  return MockupPresenceController;
}
