// A page extension is a class carrying only static component fields — that is the shape the decorator consumes.

import { RegisterPageExtension } from "@antelopejs/interface-dms/page";
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";

/**
 * The cross-module case: the target page belongs to the DMS, and this module
 * names it by its page id — no import of the DMS runtime package, so nothing
 * here owns a DMS registration and a hot reload of this module cannot take the
 * members page down with it. This is the shape dms-saas's seat-quota banner
 * takes.
 */
@RegisterPageExtension("settings.workspace.members")
export class MembersQuotaExtension {
  static seatQuota = Placeholder({
    label: "seatQuota — injected into the DMS members page by the playground",
    height: "80px",
  })
    .meta({ name: "Seat quota", icon: "i-ph-users-three" })
    .before("table");
}

/**
 * The same seat-quota slot on the invitations page, so both workspace member
 * pages carry it, as dms-saas does.
 */
@RegisterPageExtension("settings.workspace.members.invites")
export class InvitesQuotaExtension {
  static seatQuota = Placeholder({
    label:
      "seatQuota — injected into the DMS invitations page by the playground",
    height: "80px",
  })
    .meta({ name: "Seat quota", icon: "i-ph-users-three" })
    .before("table");
}
