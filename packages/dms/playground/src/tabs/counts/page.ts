import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Banner } from "@antelopejs/interface-dms/base/banner";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import { Color } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";
import { TAB_COUNTS_TOPIC } from "../topics";

/**
 * A record's tabs counting what each holds: one request answers every
 * count, which replaces the tab's static badge.
 */
@RegisterPage()
export class PageTabsCounts extends PageController(
  "tabs-counts",
  {
    displayName: "Tab counts",
    icon: "i-ph-hash",
    category: pageCategory,
    order: 4,
    description:
      'Each tab\'s badge comes from one module route (badgesUrl), read again on each event of its realtimeTopic. Press "Add a member and an invoice" to see both badges move.',
  },
  DefaultLayout({
    headerActions: [
      {
        id: "add",
        label: "Add a member and an invoice",
        icon: "i-ph-plus",
        target: {
          type: "api",
          method: "POST",
          url: "/api/tab-counts/add",
          successMessage: "Counts published",
        },
      },
    ],
  }),
) {
  static tabs = Tab({
    items: [
      { label: "Overview", icon: "i-ph-info", slot: "overview" },
      { label: "Members", icon: "i-ph-users", slot: "members", badge: "…" },
      { label: "Invoices", icon: "i-ph-receipt", slot: "invoices", badge: "…" },
    ],
    badgesUrl: "/api/tab-counts/get",
    realtimeTopic: TAB_COUNTS_TOPIC,
    color: Color.primary,
  })
    .child(
      "overview",
      Banner({
        title: "Counts come from /api/tab-counts/get",
        description:
          "One request answers { members, invoices }, read again on each counts event.",
      }),
      { slot: "overview" },
    )
    .child("members", Banner({ title: "The members of the workspace" }), {
      slot: "members",
    })
    .child("invoices", Banner({ title: "The invoices sent" }), {
      slot: "invoices",
    });
}
