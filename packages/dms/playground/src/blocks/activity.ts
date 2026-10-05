import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { ActivityFeed } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { blocksCategory } from "./category";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Static entries are written once, when the page registers: their dates are
// relative to the backend start, so they all fall on "Today".
function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

@RegisterPage()
export class PageBlocksActivity extends PageController("blocks-activity", {
  displayName: "Activity feed",
  icon: "i-ph-pulse",
  category: blocksCategory,
  order: 40,
  description:
    "ActivityFeed block: day separators, unread dots, links, view all, relative times, mono logs, loading, empty and error states",
}) {
  static feeds = Grid({ gap: "1rem", minColumnWidth: "360px" }).child(
    "row",
    GridRow()
      .child(
        "live",
        ActivityFeed({
          title: "Activity",
          fetchUrl: "/api/blocks-feed/activity",
          // The route answers 11 entries: the skeleton draws as many rows.
          skeletonCount: 11,
          actions: [{ label: "View all", to: "/settings/user/notifications" }],
        }),
      )
      .child(
        "recent",
        ActivityFeed({
          title: "Recent · last 4",
          fetchUrl: "/api/blocks-feed/activity",
          groupByDay: false,
          maxItems: 4,
        }),
      ),
  );

  static logs = Grid({ gap: "1rem", minColumnWidth: "300px" }).child(
    "row",
    GridRow()
      .child(
        "queries",
        ActivityFeed({
          title: "Recent queries",
          mono: true,
          groupByDay: false,
          items: [
            {
              icon: "i-ph-check",
              tone: "success",
              title: "SELECT id, total FROM orders WHERE status = 'paid'",
              meta: ["128 rows", "41 ms"],
              date: ago(2 * MINUTE_MS),
            },
            {
              icon: "i-ph-check",
              tone: "success",
              title: "UPDATE customers SET tier = 'gold' WHERE …",
              meta: ["12 rows", "9 ms"],
              date: ago(9 * MINUTE_MS),
            },
            {
              icon: "i-ph-x",
              tone: "error",
              title: "DELETE FROM invoices WHERE …",
              meta: ["blocked by policy"],
              date: ago(HOUR_MS),
            },
          ],
        }),
      )
      .child(
        "empty",
        ActivityFeed({
          title: "Activity · empty",
          fetchUrl: "/api/blocks-feed/empty",
          empty: {
            title: "No activity yet",
            description:
              "Orders, releases and assistant changes will show up here.",
          },
        }),
      )
      .child(
        "error",
        ActivityFeed({
          title: "Activity · error",
          fetchUrl: "/api/blocks-feed/missing",
        }),
      ),
  );
}
