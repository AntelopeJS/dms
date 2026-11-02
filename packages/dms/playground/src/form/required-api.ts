import {
  Controller,
  HTTPResult,
  JSONBody,
  Put,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { formSchema } from "@antelopejs/interface-dms/base/form";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { type DemoRecord, JSON_TYPE } from "./demo-record-api";
import { PageFormRequired } from "./required/page";

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const TAKEN_USERNAME = "admin";
const UNKNOWN_POSTAL_CODE = "0000";
const USERNAME_TAKEN_KEY = "$demo.form_pages.username_taken";
const ADDRESS_FIELD = "address";
const POSTAL_CODE_PART = "postalCode";

function refuseTakenUsername(username: DemoRecord["username"]): void {
  if (username !== TAKEN_USERNAME) return;
  throw new HTTPResult(
    HTTP_CONFLICT,
    JSON.stringify({
      field: "username",
      message: USERNAME_TAKEN_KEY,
      params: { name: TAKEN_USERNAME },
    }),
    JSON_TYPE,
  );
}

function refuseUnknownPostalCode(address: DemoRecord["address"]): void {
  if (address?.postalCode !== UNKNOWN_POSTAL_CODE) return;
  throw new HTTPResult(
    HTTP_BAD_REQUEST,
    JSON.stringify([
      {
        path: [ADDRESS_FIELD, POSTAL_CODE_PART],
        message: "Unknown postal code",
      },
    ]),
    JSON_TYPE,
  );
}

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
  async submit(@JSONBody() body: DemoRecord) {
    refuseTakenUsername(body.username);
    refuseUnknownPostalCode(body[ADDRESS_FIELD]);
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
