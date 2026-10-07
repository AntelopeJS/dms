import {
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Put,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { formSchema } from "@antelopejs/interface-dms/base/form";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { PageFormInstant } from "./instant/page";

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_UNAVAILABLE = 503;
const JSON_TYPE = "application/json";
const TAKEN_NAME = "taken";
const OFFLINE_NAME = "offline";

/** The demo's preferences, kept in memory: a restart puts them back. */
const preferences: Record<string, unknown> = {
  name: "Acme",
  website: "https://acme.example",
  digest: "weekly",
  mentions: true,
  retention: 30,
};

/** Loads the "Instant save" demo form and saves one field at a time. */
export class FormInstantAPIController extends Controller("/api/form-instant") {
  @AuthUserWithPermission(PageFormInstant)
  declare user: User;

  @Get("get")
  get() {
    return preferences;
  }

  @Put("save")
  async save(@JSONBody() body: Record<string, unknown>) {
    if (body.name === TAKEN_NAME) {
      throw new HTTPResult(
        HTTP_CONFLICT,
        JSON.stringify({
          field: "name",
          message: "This name is already taken.",
        }),
        JSON_TYPE,
      );
    }
    if (body.name === OFFLINE_NAME) {
      throw new HTTPResult(HTTP_UNAVAILABLE, "Service unavailable");
    }
    const parsed = await formSchema(PageFormInstant.form)
      .partial()
      .safeParseAsync(body);
    if (!parsed.success) {
      throw new HTTPResult(
        HTTP_BAD_REQUEST,
        JSON.stringify(parsed.error.issues),
        JSON_TYPE,
      );
    }
    Object.assign(preferences, parsed.data);
    return preferences;
  }
}
