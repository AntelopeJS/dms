import { Controller, Get, Parameter, Post } from "@antelopejs/interface-api";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { RegisterPermission } from "@antelopejs/interface-dms/permissions";
import {
  PAGE_HEADER_AUDIT_PERMISSION_ID,
  PAGE_HEADER_DEMO_API,
} from "./category";

const DEFAULT_WORKSPACE = "web";
const DEFAULT_LOCALE = "en";

RegisterPermission(PAGE_HEADER_AUDIT_PERMISSION_ID, {
  id: PAGE_HEADER_AUDIT_PERMISSION_ID,
  title: "Open the audit trail",
  icon: "i-ph-scroll",
  description: "Shows the Audit button of the page header demo",
});

interface ExportFile {
  workspace: string;
  locale: string;
  exportedBy: string;
  exportedAt: string;
}

interface PublishResult {
  workspace: string;
  published: boolean;
}

/**
 * The routes the page header demo's buttons call. The export is behind
 * `AuthUser`: the download only succeeds because the browser fetches it with
 * the user's session.
 */
export class PageHeaderDemoController extends Controller(PAGE_HEADER_DEMO_API) {
  @Get("export")
  export(
    @AuthUser() user: User,
    @Parameter("workspace", "query") workspace: string | undefined,
    @Parameter("locale", "query") locale: string | undefined,
  ): ExportFile {
    return {
      workspace: workspace ?? DEFAULT_WORKSPACE,
      locale: locale ?? DEFAULT_LOCALE,
      exportedBy: user.email,
      exportedAt: new Date().toISOString(),
    };
  }

  @Post("publish")
  publish(
    @AuthUser() _user: User,
    @Parameter("workspace", "query") workspace: string | undefined,
  ): PublishResult {
    return { workspace: workspace ?? DEFAULT_WORKSPACE, published: true };
  }
}
