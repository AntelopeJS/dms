import { Controller, Get, Post } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import { PageTabsCounts } from "./counts/page";
import { TAB_COUNTS_TOPIC } from "./topics";

const INITIAL_MEMBERS = 12;
const INITIAL_INVOICES = 1284;
const COUNTS_EVENT_TYPE = "counts.update";

let members = INITIAL_MEMBERS;
let invoices = INITIAL_INVOICES;
let pageReads = 0;

/** The badges of the "Tab counts" demo, by tab slot. */
export class TabCountsAPIController extends Controller("/api/tab-counts") {
  @AuthUserWithPermission(PageTabsCounts)
  declare user: User;

  @Get("get")
  counts() {
    return { members, invoices };
  }

  // Published, so the badges read again without a page refresh.
  @Post("add")
  async add() {
    members += 1;
    invoices += 1;
    await PublishMessage(TAB_COUNTS_TOPIC, COUNTS_EVENT_TYPE);
    return { members, invoices };
  }
}

/**
 * Counts the reads of the "Basic tabs" demo's list: each tab change asks the
 * page to refresh (TabEvents.TAB_CHANGE watched with REFRESH_PAGE).
 */
export class TabReadsAPIController extends Controller("/api/tab-reads") {
  @Get("")
  reads() {
    pageReads += 1;
    return {
      items: [
        { label: "Reads of this list", value: pageReads, type: "mono" },
        { label: "Read at", value: new Date().toISOString(), type: "date" },
      ],
    };
  }
}
