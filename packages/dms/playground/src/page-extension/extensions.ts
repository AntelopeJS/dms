import { RegisterPageExtension } from "@antelopejs/interface-dms/page";
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";
import { pagesSection } from "../sections";

const TARGET_PAGE_ID = `${pagesSection.fullId}.page-extension`;

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

  static billingNotice = Placeholder({
    label: "billingNotice — BillingExtension, .after(table)",
  })
    .meta({ name: "Billing notice" })
    .after("table");

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
 * Stands in for a second extending module competing for the same anchor. At
 * an equal `order` the two `.after("table")` blocks would fall back to the
 * extension class and field names, the same on every restart, which puts
 * `BillingExtension` first; `.order(-1)` puts this one first instead.
 */
@RegisterPageExtension(TARGET_PAGE_ID)
export class UsageExtension {
  static usageSummary = Placeholder({
    label: "usageSummary — UsageExtension, .after(table).order(-1)",
  })
    .meta({ name: "Usage summary" })
    .after("table")
    .order(-1);

  static nestedSummary = Placeholder({
    label: "nestedSummary — .after(content.tasks)",
  })
    .meta({ name: "Nested summary" })
    .after("content.tasks");
}
