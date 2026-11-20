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
  blockIdOf,
  parseViewerId,
  type Renewal,
  type ViewerId,
  viewerIdSchema,
} from "./presence";
import {
  digestOf,
  readSpecText,
  type SpecDigest,
  withSpecLock,
} from "./source";

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const MAX_POINTER = 2048;

const lockBodySchema = z
  .object({
    viewer: viewerIdSchema,
    /** The spec JSON pointer of the node the viewer is about to edit; none renews the lock the viewer holds, wherever its block is. */
    path: z
      .string()
      .max(MAX_POINTER)
      .regex(/^(?:\/[^/]*)*$/)
      .optional(),
    /** The digest of the spec the viewer read the block's pointer in: a take needs it, so that a write landed meanwhile cannot move the pointer to another block. */
    digest: z.string().optional(),
  })
  .strict()
  .refine((body) => body.path === undefined || body.digest !== undefined, {
    message: "a take sends the digest of the spec it read",
  });

/** What taking or renewing a lock answers when it worked. */
export interface LockAnswer {
  ok: true;
  /** The id the locked block carries in the spec, which a client finds it by after a write moves it. */
  id: string;
}

/** What freeing a lock answers when it worked. */
export interface ReleaseAnswer {
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
  | Exclude<Renewal, { kind: "renewed" }>
  | { kind: "no_mockup" }
  | { kind: "ambiguous" }
  | { kind: "stale"; digest: SpecDigest }
  | { kind: "spec_invalid"; errors: Array<{ path: string; message: string }> };

function refused(refusal: Refusal): HTTPResult {
  switch (refusal.kind) {
    case "no_mockup":
      return notFound("mockup");
    case "no_node":
      return notFound("node at this path");
    case "no_lock":
      return notFound("lock");
    case "unknown_viewer":
      return notOnMockup();
    case "held":
      return new HTTPResult(HTTP_CONFLICT, {
        message: `${refusal.by} is editing this block`,
        holder: refusal.by,
      });
    case "stale":
      return new HTTPResult(HTTP_CONFLICT, {
        message:
          "spec.json changed since it was read, so the pointer may name another block: read it again and retake the lock",
        digest: refusal.digest,
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
     * has none, as a note pinned on it would give it, and the answer names the
     * id. Answers 409 with the holder's name while another viewer holds that
     * node, an ancestor of it or a descendant, and while the spec has changed
     * since the `digest` the viewer sent (a take names one): the pointer may
     * then name another block, so nothing is granted nor stamped. With no `path`, it pushes back
     * the expiry of the lock `viewer` holds wherever its block is now, and
     * answers 404 when it holds none.
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
      const { viewer, path, digest } = parsed.data;
      if (!board.viewerOf(name, viewer, owner.userId)) throw notOnMockup();
      if (path === undefined) {
        const renewal = board.renew(name, { id: viewer, userId: owner.userId });
        if (renewal.kind !== "renewed") throw refused(renewal);
        return { ok: true, id: renewal.id };
      }
      const answer = await withSpecLock(
        mockupsDir,
        name,
        async (_write, stamp): Promise<Refusal | LockAnswer> => {
          const text = await readSpecText(mockupsDir, name);
          if (text === undefined) return { kind: "no_mockup" };
          const current = digestOf(text);
          if (current !== digest) return { kind: "stale", digest: current };
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
          return { ok: true, id: blockIdOf(anchored.anchor) };
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
    ): Promise<ReleaseAnswer> {
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
