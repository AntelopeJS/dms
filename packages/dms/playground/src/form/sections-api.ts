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
import { PageFormSections } from "./sections/page";

const HTTP_BAD_REQUEST = 400;
const JSON_TYPE = "application/json";

/** The demo's settings, kept in memory: a restart puts the defaults back. */
const settings: Record<string, unknown> = {
  agent: "claude",
  thinking: "medium",
  approvalMode: "ask",
  alwaysAsk: ["delete"],
  workspaceRoot: "/srv/acme",
  allowedHosts: "github.com",
  skillsEnabled: true,
  skillsPath: "",
  retentionDays: 30,
  notify: true,
};

/** Loads and saves the "Sections" demo form. */
export class FormSectionsAPIController extends Controller(
  "/api/form-sections",
) {
  @AuthUserWithPermission(PageFormSections)
  declare user: User;

  @Get("get")
  get() {
    return settings;
  }

  @Put("save")
  async save(@JSONBody() body: Record<string, unknown>) {
    const parsed = await formSchema(PageFormSections.form)
      .partial()
      .safeParseAsync(body);
    if (!parsed.success) {
      throw new HTTPResult(
        HTTP_BAD_REQUEST,
        JSON.stringify(parsed.error.issues),
        JSON_TYPE,
      );
    }
    Object.assign(settings, parsed.data);
    return settings;
  }
}
