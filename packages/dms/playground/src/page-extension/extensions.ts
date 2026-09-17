// A page extension is a class carrying only static component fields — that is the shape the decorator consumes.

import { RegisterPageExtension } from "@antelopejs/interface-dms/page";
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";

// The target is named by its page id, the same string the roles screen shows as
// its permission: "pages" (the root category) + "internals" (the section) +
// the page's own id.
const TARGET_PAGE_ID = "pages.internals.page-extension";

/**
 * Stands in for the first extending module (dms-saas): a banner above the
 * target's table, plus a block appended after everything the page declares.
 */
@RegisterPageExtension(TARGET_PAGE_ID)
export class BillingExtension {
  static billingBanner = Placeholder({
    label: "billingBanner — BillingExtension, .before(table)",
  })
    .meta({ name: "Billing banner" })
    .before("table");

  static billingFooter = Placeholder({
    label: "billingFooter — BillingExtension, appended",
  }).meta({ name: "Billing footer" });

  static nestedBanner = Placeholder({
    label: "nestedBanner — .before(content.tasks)",
  })
    .meta({ name: "Nested banner" })
    .before("content.tasks");
}

/**
 * Stands in for a second extending module competing for the same anchor. The
 * two `.after("table")` blocks keep the same relative order whatever order the
 * modules start in: equal `order` falls back to the extension class and field
 * names, so `BillingExtension` never overtakes `UsageExtension` (or vice versa)
 * because of a restart.
 */
@RegisterPageExtension(TARGET_PAGE_ID)
export class UsageExtension {
  static usageSummary = Placeholder({
    label: "usageSummary — UsageExtension, .after(table)",
  })
    .meta({ name: "Usage summary" })
    .after("table");

  static nestedSummary = Placeholder({
    label: "nestedSummary — .after(content.tasks)",
  })
    .meta({ name: "Nested summary" })
    .after("content.tasks");
}
