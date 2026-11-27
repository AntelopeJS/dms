import {
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Parameter,
  Put,
} from "@antelopejs/interface-api";
import {
  type BlockTypeDescriptor,
  ListBlockTypes,
} from "@antelopejs/interface-dms/base/block-types";
import { z } from "zod";
import { MOCKUP_API } from "./fixtures";
import { jsonObjectSchema, type JsonObject, parseMockupName } from "./model";
import { MockupOwnerController } from "./owner-controller";
import { notFound } from "./refusals";
import { viewOf } from "./anchor";
import type { PresenceBoard } from "./presence-board";
import { viewerIdSchema } from "./presence";
import {
  readSpecSource,
  type SpecDigest,
  type SpecWriteResult,
  withSpecLock,
} from "./source";

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;

const writeBodySchema = z
  .object({
    spec: jsonObjectSchema,
    /** The digest the editor read: refused when the file changed since. */
    digest: z.string().optional(),
    /** The viewer writing, whose own lock does not refuse the write; one with no event stream open writes as none, but the file is still said to be its user's. */
    viewer: viewerIdSchema.optional(),
  })
  .strict();

/** What `GET /api/mockup/schema/blocks` answers: every registered block type. */
export interface BlockCatalogAnswer {
  blocks: BlockTypeDescriptor[];
}

/** What `GET /api/mockup/:name/spec` answers. */
export interface SpecSourceAnswer {
  spec: JsonObject;
  digest: SpecDigest;
  /** The editor whose write made this very file, when the last write was an editor's: by name, as a viewer id is that viewer's alone. */
  writtenBy?: { name: string };
}

/**
 * The routes the `/mockup` editor writes through: the spec as written, a
 * whole-spec write checked exactly as `mockup_write_spec` checks it, and the
 * block catalog its inspector reads. Development only, and platform owners
 * only, like the rest of the mockup API.
 */
export function registerSpecRoutes(
  mockupsDir: string,
  presence: PresenceBoard,
) {
  function nameOf(raw: string) {
    const name = parseMockupName(raw);
    if (!name) throw notFound("mockup");
    return name;
  }

  class MockupSourceController extends Controller(
    MOCKUP_API,
    MockupOwnerController,
  ) {
    @Get("schema/blocks")
    async blocks(): Promise<BlockCatalogAnswer> {
      await this.assertOwner();
      return { blocks: ListBlockTypes() };
    }

    @Get(":name/spec")
    async source(
      @Parameter("name") rawName: string,
    ): Promise<SpecSourceAnswer> {
      await this.assertOwner();
      const name = nameOf(rawName);
      const source = await readSpecSource(mockupsDir, name);
      if (!source) throw notFound("mockup");
      if (!source.spec) {
        throw new HTTPResult(HTTP_CONFLICT, {
          message: "$dms.refusals.mockup.spec_not_object",
        });
      }
      const answer: SpecSourceAnswer = {
        spec: source.spec,
        digest: source.digest,
      };
      const writtenBy = presence.writtenBy(name, source.digest);
      if (writtenBy) answer.writtenBy = writtenBy;
      return answer;
    }

    @Put(":name/spec")
    async write(
      @Parameter("name") rawName: string,
      @JSONBody() body: unknown,
    ): Promise<SpecWriteResult> {
      const owner = await this.owner();
      const name = nameOf(rawName);
      const parsed = writeBodySchema.safeParse(body);
      if (!parsed.success) {
        throw new HTTPResult(HTTP_BAD_REQUEST, {
          message: parsed.error.message,
        });
      }
      const { spec, digest } = parsed.data;
      const viewer =
        parsed.data.viewer &&
        presence.viewerOf(name, parsed.data.viewer, owner.userId)
          ? parsed.data.viewer
          : undefined;
      return withSpecLock(mockupsDir, name, async (write) => {
        const current = await readSpecSource(mockupsDir, name);
        if (digest !== undefined && current && current.digest !== digest) {
          throw new HTTPResult(HTTP_CONFLICT, {
            message: "$dms.refusals.mockup.spec_changed",
            digest: current.digest,
          });
        }
        const errors = current?.spec
          ? presence.refusals(name, viewer, current.spec, spec)
          : [];
        if (errors.length) return { ok: false, errors, warnings: [] };
        const written = await write(spec, { by: "you" });
        if (written.ok) {
          presence.noteWrite(
            name,
            written.digest,
            parsed.data.viewer === undefined ? undefined : owner.name,
          );
          presence.settle(name, viewOf(spec));
        }
        return written;
      });
    }
  }
  return MockupSourceController;
}
