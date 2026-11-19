import {
  Controller,
  Delete,
  HTTPResult,
  JSONBody,
  Parameter,
  Post,
  Route,
} from "@antelopejs/interface-api";
import { z } from "zod";
import { MOCKUP_API } from "./fixtures";
import {
  deleteMockup,
  duplicateMockup,
  type ManageRefusal,
  type MockupNamed,
  renameMockup,
} from "./manage";
import { mockupNameSchema, parseMockupName } from "./model";
import { MockupOwnerController } from "./owner-controller";

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const MAX_TITLE_LENGTH = 120;

const renameBodySchema = z
  .object({
    name: mockupNameSchema.optional(),
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
  })
  .strict()
  .refine(({ name, title }) => name !== undefined || title !== undefined, {
    message: "give a name, a title, or both",
  });

const duplicateBodySchema = z
  .object({ name: mockupNameSchema.optional() })
  .strict();

function refusal(
  refused: ManageRefusal | { kind: "no_free_name" },
): HTTPResult {
  switch (refused.kind) {
    case "no_mockup":
      return new HTTPResult(HTTP_NOT_FOUND, { message: "mockup not found" });
    case "exists":
      return new HTTPResult(HTTP_CONFLICT, {
        message: "another mockup already has this name",
      });
    case "no_free_name":
      return new HTTPResult(HTTP_CONFLICT, {
        message: "no free name for the copy: give one",
      });
  }
}

function badBody(error: z.ZodError): HTTPResult {
  return new HTTPResult(HTTP_BAD_REQUEST, { message: error.message });
}

/**
 * The routes that rename, copy and delete a mockup's folder, which the
 * Mockups page's card menu calls. Development only, and platform owners
 * only, like the rest of the mockup API.
 */
export function registerManageRoutes(mockupsDir: string) {
  function nameOf(raw: string) {
    const name = parseMockupName(raw);
    if (!name) {
      throw new HTTPResult(HTTP_NOT_FOUND, { message: "mockup not found" });
    }
    return name;
  }

  class MockupManageController extends Controller(
    MOCKUP_API,
    MockupOwnerController,
  ) {
    @Route("handler", "patch", ":name")
    async rename(
      @Parameter("name") rawName: string,
      @JSONBody() body: unknown,
    ): Promise<MockupNamed> {
      await this.assertOwner();
      const name = nameOf(rawName);
      const change = renameBodySchema.safeParse(body);
      if (!change.success) throw badBody(change.error);
      const renamed = await renameMockup(mockupsDir, name, change.data);
      if (renamed.kind !== "done") throw refusal(renamed);
      return { name: renamed.name };
    }

    @Post(":name/duplicate")
    async duplicate(
      @Parameter("name") rawName: string,
      @JSONBody() body: unknown,
    ): Promise<MockupNamed> {
      await this.assertOwner();
      const name = nameOf(rawName);
      const request = duplicateBodySchema.safeParse(body ?? {});
      if (!request.success) throw badBody(request.error);
      const copied = await duplicateMockup(mockupsDir, name, request.data.name);
      if (copied.kind !== "done") throw refusal(copied);
      return { name: copied.name };
    }

    @Delete(":name")
    async remove(
      @Parameter("name") rawName: string,
    ): Promise<{ name: string }> {
      await this.assertOwner();
      const name = nameOf(rawName);
      const deleted = await deleteMockup(mockupsDir, name);
      if (deleted.kind !== "done") throw refusal(deleted);
      return { name };
    }
  }
  return MockupManageController;
}
