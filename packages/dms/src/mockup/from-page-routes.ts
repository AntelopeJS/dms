import {
  Controller,
  HTTPResult,
  JSONBody,
  Post,
} from "@antelopejs/interface-api";
import { z } from "zod";
import { MOCKUP_API } from "./fixtures";
import {
  BUILDER_PAGES,
  type EditAsMockupAnswer,
  editPageAsMockup,
  type LivePages,
} from "./live-page";
import { mockupNameSchema } from "./model";
import { MockupOwnerController } from "./owner-controller";
import type { PresenceBoard } from "./presence-board";

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;

type Failure = Extract<EditAsMockupAnswer, { ok: false }>;

const FAILURE_STATUS: Readonly<Record<Failure["error"], number>> = {
  not_found: HTTP_NOT_FOUND,
  unreadable: HTTP_UNPROCESSABLE,
  conflict: HTTP_CONFLICT,
  invalid: HTTP_UNPROCESSABLE,
};

const replacing = {
  replace: z.boolean().optional(),
  /** The digest of the mockup's spec the client read: a replace needs it. */
  digest: z.string().optional(),
  /** Converts into the page of this mockup linked to the live page, never another mockup. */
  mockup: mockupNameSchema.optional(),
};

const fromPageBodySchema = z
  .union([
    z.object({ path: z.string().min(1), ...replacing }).strict(),
    z.object({ pageRef: z.string().min(1), ...replacing }).strict(),
  ])
  .refine((body) => body.replace !== true || body.digest !== undefined, {
    message: "a replace sends the digest of the spec it replaces",
  });

/**
 * `POST /api/mockup/from-page`: converts a live page into a mockup, or opens
 * the one it has (see {@link editPageAsMockup}). The dashboard sends the
 * path it shows (`{ path }`); a tool may send a builder ref (`{ pageRef }`).
 * Development only, and platform owners only, like the rest of the mockup API.
 * A replace never overwrites a block another viewer holds, as `PUT /spec`
 * would not: it answers 409 with the blocks held.
 */
export function registerFromPageRoute(
  mockupsDir: string,
  presence: PresenceBoard,
  pages: LivePages = BUILDER_PAGES,
) {
  class MockupFromPageController extends Controller(
    MOCKUP_API,
    MockupOwnerController,
  ) {
    @Post("from-page")
    async fromPage(@JSONBody() body: unknown): Promise<EditAsMockupAnswer> {
      await this.assertOwner();
      const parsed = fromPageBodySchema.safeParse(body);
      if (!parsed.success) {
        throw new HTTPResult(HTTP_BAD_REQUEST, {
          message: parsed.error.message,
        });
      }
      const { replace, digest, mockup, ...target } = parsed.data;
      const answer = await editPageAsMockup(
        mockupsDir,
        target,
        {
          replace,
          digest,
          mockup,
          refusals: (held, current, next) =>
            presence.refusals(held, undefined, current, next),
        },
        pages,
      );
      if (!answer.ok)
        throw new HTTPResult(FAILURE_STATUS[answer.error], answer);
      return answer;
    }
  }
  return MockupFromPageController;
}
