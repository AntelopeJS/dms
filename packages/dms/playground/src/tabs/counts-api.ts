import { Controller, Get } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { PageTabsCounts } from "./counts/page";

const MEMBERS = 12;
const INVOICES = 1284;

/** The badges of the "Tab counts" demo, by tab slot. */
export class TabCountsAPIController extends Controller("/api/tab-counts") {
  @AuthUserWithPermission(PageTabsCounts)
  declare user: User;

  @Get("get")
  counts() {
    return { members: MEMBERS, invoices: INVOICES };
  }
}
