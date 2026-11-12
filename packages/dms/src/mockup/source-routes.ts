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
import {
  readSpecSource,
  type SpecDigest,
  type SpecWriteResult,
  withSpecLock,
} from "./source";

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

const writeBodySchema = z
  .object({
    spec: jsonObjectSchema,
    /** The digest the editor read: refused when the file changed since. */
    digest: z.string().optional(),
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
}

/**
 * The routes the `/mockup` editor writes through: the spec as written, a
 * whole-spec write checked exactly as `mockup_write_spec` checks it, and the
 * block catalog its inspector reads. Development only, and unauthenticated,
 * like the rest of the mockup API.
 */
export function registerSpecRoutes(mockupsDir: string) {
  function nameOf(raw: string) {
    const name = parseMockupName(raw);
    if (!name) {
      throw new HTTPResult(HTTP_NOT_FOUND, { message: "mockup not found" });
    }
    return name;
  }

  class MockupSourceController extends Controller(MOCKUP_API) {
    @Get("schema/blocks")
    blocks(): BlockCatalogAnswer {
      return { blocks: ListBlockTypes() };
    }

    @Get(":name/spec")
    async source(
      @Parameter("name") rawName: string,
    ): Promise<SpecSourceAnswer> {
      const source = await readSpecSource(mockupsDir, nameOf(rawName));
      if (!source) {
        throw new HTTPResult(HTTP_NOT_FOUND, { message: "mockup not found" });
      }
      if (!source.spec) {
        throw new HTTPResult(HTTP_CONFLICT, {
          message: "spec.json holds no JSON object",
        });
      }
      return { spec: source.spec, digest: source.digest };
    }

    @Put(":name/spec")
    async write(
      @Parameter("name") rawName: string,
      @JSONBody() body: unknown,
    ): Promise<SpecWriteResult> {
      const name = nameOf(rawName);
      const parsed = writeBodySchema.safeParse(body);
      if (!parsed.success) {
        throw new HTTPResult(HTTP_BAD_REQUEST, {
          message: parsed.error.message,
        });
      }
      const { spec, digest } = parsed.data;
      return withSpecLock(mockupsDir, name, async (write) => {
        if (digest !== undefined) {
          const current = await readSpecSource(mockupsDir, name);
          if (current && current.digest !== digest) {
            throw new HTTPResult(HTTP_CONFLICT, {
              message: "spec.json changed since it was read",
              digest: current.digest,
            });
          }
        }
        return write(spec);
      });
    }
  }
  return MockupSourceController;
}
