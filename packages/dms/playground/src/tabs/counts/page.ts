import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Banner } from "@antelopejs/interface-dms/base/banner";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import { Color } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

/**
 * A record's tabs counting what each holds: one request answers every
 * count, which replaces the tab's static badge.
 */
@RegisterPage()
export class PageTabsCounts extends PageController("tabs-counts", {
  displayName: "Tab counts",
  icon: "i-ph-hash",
  category: pageCategory,
  order: 4,
  description: "Each tab's count from one module route",
}) {
  static tabs = Tab({
    items: [
      { label: "Overview", icon: "i-ph-info", slot: "overview" },
      { label: "Members", icon: "i-ph-users", slot: "members", badge: "…" },
      { label: "Invoices", icon: "i-ph-receipt", slot: "invoices", badge: "…" },
    ],
    badgesUrl: "/api/tab-counts/get",
    color: Color.primary,
  })
    .child(
      "overview",
      Banner({
        title: "Counts come from /api/tab-counts/get",
        description: "One request answers { members, invoices }.",
      }),
      { slot: "overview" },
    )
    .child("members", Banner({ title: "12 members" }), { slot: "members" })
    .child("invoices", Banner({ title: "1,284 invoices" }), {
      slot: "invoices",
    });
}
