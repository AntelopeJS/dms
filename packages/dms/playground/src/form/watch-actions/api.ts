import {
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Put,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { type DemoRecord, JSON_TYPE, parseFormBody } from "../demo-record-api";
import { PageFormWatchActions } from "./page";

const HTTP_UNPROCESSABLE = 422;
const REFUSED_NAME = "fail";

/** The member the form edits, kept in memory. */
const member: DemoRecord = {
  isOwner: false,
  displayName: "Ada",
  adminNotes: "",
  lockOwner: false,
  memberId: "mbr_4f1c",
  joinedOn: "2025-03-14",
  plan: "team",
  seats: 12,
};

/** Loads and saves the "Watch actions" demo form. */
export class FormWatchActionsAPIController extends Controller(
  "/api/form-watch-actions",
) {
  @AuthUserWithPermission(PageFormWatchActions)
  declare user: User;

  @Get("get")
  get() {
    return member;
  }

  @Put("save")
  async save(@JSONBody() body: DemoRecord) {
    if (body.displayName === REFUSED_NAME) {
      throw new HTTPResult(
        HTTP_UNPROCESSABLE,
        JSON.stringify({
          field: "displayName",
          message: "This name is refused.",
        }),
        JSON_TYPE,
      );
    }
    Object.assign(member, await parseFormBody(PageFormWatchActions.form, body));
    return member;
  }
}
