import {
  Controller,
  HTTPResult,
  JSONBody,
  Put,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { formSchema } from "@antelopejs/interface-dms/base/form";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { PageFormRequired } from "./required/page";

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const JSON_TYPE = "application/json";
const TAKEN_USERNAME = "admin";

/**
 * The submit endpoint of the "Required & Validation" demo: it validates the
 * body against the form's own schema, as a real endpoint would, and stores
 * nothing.
 */
export class FormRequiredAPIController extends Controller(
  "/api/form-required",
) {
  @AuthUserWithPermission(PageFormRequired)
  declare user: User;

  @Put("submit")
  async submit(@JSONBody() body: Record<string, unknown>) {
    // A uniqueness check needs no valid body: it answers first, alone.
    if (body.username === TAKEN_USERNAME) {
      throw new HTTPResult(
        HTTP_CONFLICT,
        JSON.stringify({
          field: "username",
          message: "This username is already taken.",
        }),
        JSON_TYPE,
      );
    }
    const parsed = await formSchema(PageFormRequired.form).safeParseAsync(body);
    if (!parsed.success) {
      throw new HTTPResult(
        HTTP_BAD_REQUEST,
        JSON.stringify(parsed.error.issues),
        JSON_TYPE,
      );
    }
    return { message: "Valid" };
  }
}
