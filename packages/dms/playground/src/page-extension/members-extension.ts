// A page extension is a class carrying only static component fields — that is the shape the decorator consumes.

import { RegisterPageExtension } from "@antelopejs/interface-dms/page";
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";
import { MembersSettingsController } from "@antelopejs/dms/pages";

/**
 * The cross-module case: the target page belongs to the DMS, and this module
 * reaches it through the DMS package's public surface — a typed import, no
 * hardcoded page id. This is the shape dms-saas's seat-quota banner takes.
 */
@RegisterPageExtension(MembersSettingsController)
export class MembersQuotaExtension {
  static seatQuota = Placeholder({
    label: "seatQuota — injected into the DMS members page by the playground",
    height: "80px",
  })
    .meta({ name: "Seat quota", icon: "i-ph-users-three" })
    .before(MembersSettingsController.table);
}
