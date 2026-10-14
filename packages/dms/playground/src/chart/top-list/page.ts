import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { PeriodSelector, TopListCard } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { REALTIME_DEMO_TOPIC } from "../api/realtime";
import { pageCategory } from "../category";

const SCOPE_ID = "demo-top-list";
// Each row leads to the dashboard with this page's period: a query pair whose
// token has no value is left out.
const ROW_LINK = `/charts/chart-dashboard?main.period={{query.${SCOPE_ID}.period}}`;

@RegisterPage()
export class PageChartTopList extends PageController(
  "chart-top-list",
  {
    displayName: "TopListCard Variants",
    icon: "i-ph-list-numbers",
    category: pageCategory,
    order: 60,
    description:
      'TopListCard: ranks, deltas, sparklines, bars, avatars, value labels and suffixes, row links keeping the period, an empty list, and a list refreshed over realtime. Press "Append a point" to move the live ranking.',
  },
  DefaultLayout({
    headerActions: [
      {
        id: "bump",
        label: "Append a point",
        icon: "i-ph-plus",
        target: {
          type: "api",
          method: "POST",
          url: "/api/dashboard/realtime/bump",
          successMessage: "Point appended",
        },
      },
    ],
  }),
) {
  static periodSelector = PeriodSelector({
    id: SCOPE_ID,
    presets: ["this-month", "last-month", "this-quarter"],
    defaultPreset: "this-month",
    defaultComparison: "previous-period",
    align: "right",
  });

  static row = Grid({ gap: "1rem" }).child(
    "topRow",
    GridRow()
      .child(
        "trending",
        TopListCard({
          title: "Top 10 trending products",
          description: "Change vs the compared period",
          fetchUrl: "/api/dashboard/top-products?limit=10&withSparkline=true",
          periodScope: SCOPE_ID,
          valueFormat: "compact",
          showSparkline: true,
          showDelta: true,
          highlightTopN: 3,
          rankColor: "primary",
          badgeColor: "primary",
        }),
      )
      .child(
        "yoy",
        TopListCard({
          title: "Top 25 products",
          description: "Scrolls inside a 320 px card",
          fetchUrl: "/api/dashboard/top-products?limit=25",
          fetchUrlMethod: HttpMethod.get,
          periodScope: SCOPE_ID,
          valueFormat: "currency",
          currencyCode: "USD",
          valuePrecision: 0,
          showSparkline: false,
          showDelta: true,
          highlightTopN: 3,
          rankColor: "info",
          badgeColor: "info",
          maxHeight: "320px",
        }),
      ),
  );

  // Slower is worse: `invert` colours a rise red, and the sparkline follows.
  static routesRow = Grid({ gap: "1rem" }).child(
    "routesRow",
    GridRow()
      .child(
        "slowest",
        TopListCard({
          title: "Slowest routes",
          description: "valueSuffix, showBar, invert, sparklineAccent auto",
          fetchUrl: "/api/dashboard/top/routes",
          periodScope: SCOPE_ID,
          valueFormat: "number",
          valueSuffix: " ms",
          showBar: true,
          showSparkline: true,
          sparklineAccent: "auto",
          invert: true,
          skeletonCount: 6,
          actions: [{ label: "Ops metrics", to: "/charts/chart-metrics" }],
        }),
      )
      .child(
        "live",
        TopListCard({
          title: "Live counter · top points",
          description: "realtimeTopic: read again on each appended point",
          fetchUrl: "/api/dashboard/realtime/top",
          realtimeTopic: REALTIME_DEMO_TOPIC,
          valueFormat: "number",
          showBar: true,
          skeletonCount: 5,
        }),
      ),
  );

  static staticRow = Grid({ gap: "1rem" }).child(
    "staticTopRow",
    GridRow()
      .child(
        "static",
        TopListCard({
          title: "Top suppliers (static)",
          description:
            "staticItems; each row opens the dashboard on this period",
          valueFormat: "currency",
          showDelta: true,
          showSparkline: true,
          sparklineAccent: "secondary",
          staticItems: [
            {
              id: 1,
              title: "Acme Components",
              description: "Electronic components",
              value: 124800,
              delta: 12.4,
              sparkline: [80, 95, 88, 110, 120, 124],
              icon: "i-lucide-package",
              to: ROW_LINK,
            },
            {
              id: 2,
              title: "Globex Industries",
              description: "Metalwork",
              value: 98600,
              delta: -3.2,
              sparkline: [110, 105, 102, 98, 99, 98],
              icon: "i-lucide-factory",
              to: ROW_LINK,
            },
            {
              id: 3,
              title: "Initech",
              description: "Software",
              value: 76200,
              delta: 5.1,
              sparkline: [70, 72, 70, 73, 75, 76],
              icon: "i-lucide-code",
              to: ROW_LINK,
            },
            {
              id: 4,
              title: "Soylent Corp",
              description: "No delta, no sparkline",
              value: 51000,
              icon: "i-lucide-leaf",
            },
          ],
        }),
      )
      .child(
        "pages",
        TopListCard({
          title: "Without rank or trend",
          description:
            "showRank and showDelta off; relative times from the route",
          fetchUrl: "/api/dashboard/top/pages",
          valueFormat: "compact",
          showRank: false,
          showDelta: false,
          showSparkline: true,
        }),
      ),
  );

  static customersRow = Grid({ gap: "1rem" }).child(
    "customersRow",
    GridRow()
      .child(
        "customers",
        TopListCard({
          title: "Top customers",
          description: "Avatars, a value label replacing the figure",
          valueFormat: "currency",
          currencyCode: "EUR",
          valuePrecision: "native",
          staticItems: [
            {
              id: "ada",
              title: "Ada Lovelace",
              avatar: { src: "https://i.pravatar.cc/64?u=ada", alt: "Ada" },
              value: 12840.5,
              to: "/settings/workspace/members",
            },
            {
              id: "grace",
              title: "Grace Hopper",
              avatar: { src: "https://i.pravatar.cc/64?u=grace", alt: "Grace" },
              value: 9310.25,
            },
            {
              id: "alan",
              title: "Alan Turing",
              avatar: { src: "https://i.pravatar.cc/64?u=alan", alt: "Alan" },
              value: 1900,
              valueLabel: {
                key: "demo.blocks.top_list.partial",
                params: { value: { type: "number", value: 1.9 } },
              },
            },
          ],
        }),
      )
      .child(
        "empty",
        TopListCard({
          title: "Empty ranking",
          staticItems: [],
          emptyLabel: "Nothing ranked this period",
        }),
      ),
  );
}
