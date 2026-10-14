import {
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Post,
  Put,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { type DemoRecord, parseFormBody } from "../demo-record-api";
import { FORM_SAVING_API, PageFormSaving } from "./page";

const HTTP_SERVER_ERROR = 500;
const FAILING_NAME = "fail";
const MEMBER_EMAIL = "ops@acme.io";
const INVITED_KEY = "$demo.form_pages.invited";
const NO_WORKSPACE = "none";

interface InviteBody {
  emails?: string[];
  workspace?: string;
  source?: string;
}

/** The contact the footer and summary forms show, kept in memory. */
const contact: DemoRecord = { name: "Ada Lovelace", email: "ada@acme.io" };

function inviteAnswer(body: InviteBody) {
  const emails = body.emails ?? [];
  const known = emails.filter((email) => email === MEMBER_EMAIL);
  const count = emails.length - known.length;
  return {
    count,
    notice: {
      title: INVITED_KEY,
      description: `Workspace: ${body.workspace ?? NO_WORKSPACE} · source: ${body.source}`,
      params: { count },
      color: "success",
    },
    ...(known.length > 0 && {
      warning: `${known.join(", ")} is already a member: not invited again.`,
    }),
  };
}

/** The routes of the "Saving & submit" demo. */
export class FormSavingAPIController extends Controller(FORM_SAVING_API) {
  @AuthUserWithPermission(PageFormSaving)
  declare user: User;

  @Get("get")
  get() {
    return contact;
  }

  @Put("save")
  async save(@JSONBody() body: DemoRecord) {
    if (body.name === FAILING_NAME) {
      throw new HTTPResult(HTTP_SERVER_ERROR, "Storage unavailable");
    }
    Object.assign(contact, await parseFormBody(PageFormSaving.footer, body));
    return contact;
  }

  @Post("invite")
  invite(@JSONBody() body: InviteBody) {
    return inviteAnswer(body);
  }
}
