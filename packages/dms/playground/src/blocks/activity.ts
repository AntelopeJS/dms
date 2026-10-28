import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { ActivityFeed, PeriodSelector } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { blocksCategory } from "./category";
import { ACTIVITY_DEMO_TOPIC } from "./feed-api";

const ATTENTION_SCOPE = "blocks-activity-attention";
const DECLARED_ATTENTION_COUNT = 4;

@RegisterPage()
export class PageBlocksActivity extends PageController(
  "blocks-activity",
  {
    displayName: "Activity feed",
    icon: "i-ph-pulse",
    category: blocksCategory,
    order: 40,
    description:
      'ActivityFeed block: day separators, unread dots, links, realtime entries, a head with a badge and a count, "Show N more", wrapped mono details, a bare feed, then the empty, error and not-found states. Press "Add an entry" to push one over realtime.',
  },
  DefaultLayout({
    headerActions: [
      {
        id: "add-entry",
        label: "Add an entry",
        icon: "i-ph-plus",
        target: {
          type: "api",
          method: "POST",
          url: "/api/blocks-feed/activity/add",
          successMessage: "Entry added and published",
        },
      },
    ],
  }),
) {
  static feeds = Grid({ gap: "1rem", minColumnWidth: "360px" }).child(
    "row",
    GridRow()
      .child(
        "live",
        ActivityFeed({
          title: "Activity",
          fetchUrl: "/api/blocks-feed/activity",
          fetchUrlMethod: HttpMethod.get,
          realtimeTopic: ACTIVITY_DEMO_TOPIC,
          skeletonCount: 11,
          actions: [{ label: "View all", to: "/settings/user/notifications" }],
        }),
      )
      .child(
        "recent",
        ActivityFeed({
          title: "Recent · last 4",
          fetchUrl: "/api/blocks-feed/activity",
          realtimeTopic: ACTIVITY_DEMO_TOPIC,
          groupByDay: false,
          maxItems: 4,
        }),
      ),
  );

  static attentionPeriod = PeriodSelector({
    id: ATTENTION_SCOPE,
    variant: "segmented",
    size: "xs",
    presets: ["last-24h", "last-7-days", "last-30-days"],
    comparisons: ["none"],
    defaultPreset: "last-24h",
  });

  static heads = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "attention",
        ActivityFeed({
          title: "Needs attention",
          badge: "4xx · 5xx · slow",
          count: DECLARED_ATTENTION_COUNT,
          fetchUrl: "/api/blocks-feed/attention",
          periodScope: ATTENTION_SCOPE,
          groupByDay: false,
          mono: true,
          wrap: true,
          visibleItems: 3,
          fillHeight: true,
        }),
      )
      .child(
        "queries",
        ActivityFeed({
          title: "Recent queries",
          badge: {
            key: "demo.blocks.activity.badge_rows",
            params: { count: { type: "count", value: 141 } },
          },
          mono: true,
          groupByDay: false,
          items: [
            {
              icon: "i-ph-check",
              tone: "success",
              title: "SELECT id, total FROM orders WHERE status = 'paid'",
              meta: ["128 rows", "41 ms"],
              time: "2 min ago",
            },
            {
              icon: "i-ph-check",
              tone: "success",
              title: "UPDATE customers SET tier = 'gold' WHERE …",
              meta: ["12 rows", "9 ms"],
              time: "9 min ago",
            },
            {
              icon: "i-ph-x",
              tone: "error",
              title: "DELETE FROM invoices WHERE …",
              meta: ["blocked by policy"],
              detail: 'policy "no-delete-invoices" · role Editor',
              time: "1 h ago",
            },
            {
              icon: "i-ph-check",
              tone: "success",
              title: "SELECT count(*) FROM sessions",
              meta: ["1 row", "3 ms"],
              time: "2 h ago",
            },
            {
              icon: "i-ph-check",
              tone: "success",
              title: "VACUUM ANALYZE orders",
              meta: ["maintenance"],
              time: "yesterday",
            },
          ],
        }),
      )
      .child(
        "bare",
        ActivityFeed({
          title: "Bare feed · card: false",
          card: false,
          groupByDay: false,
          items: [
            {
              icon: "i-ph-rocket-launch",
              tone: "primary",
              title: "Deploy v2.14",
              time: "just now",
              detail: "staging → production · 42 s",
            },
            {
              icon: "i-ph-git-commit",
              title: "Merge #482",
              time: "10:02",
            },
          ],
        }),
      ),
  );

  static states = Grid({ gap: "1rem", minColumnWidth: "300px" }).child(
    "row",
    GridRow()
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
          fetchUrl: "/api/blocks-feed/broken",
        }),
      )
      .child(
        "notFound",
        ActivityFeed({
          title: "Activity · not found",
          fetchUrl: "/api/blocks-feed/gone",
        }),
      ),
  );
}
