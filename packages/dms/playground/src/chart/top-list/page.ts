import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { PeriodSelector, TopListCard } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { pageCategory } from "../category";

const SCOPE_ID = "demo-top-list";

@RegisterPage()
export class PageChartTopList extends PageController("chart-top-list", {
  displayName: "TopListCard Variants",
  icon: "i-ph-list-numbers",
  category: pageCategory,
  order: 60,
  description: "Variants of TopListCard with and without scope",
}) {
  static periodSelector = PeriodSelector({
    id: SCOPE_ID,
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
          title: "Top 10 produits en tendance",
          description: "Hausse vs période comparée",
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
          title: "Top 25 produits 2025",
          description: "Hausse vs même période il y a 11 mois",
          fetchUrl: "/api/dashboard/top-products?limit=25",
          periodScope: SCOPE_ID,
          valueFormat: "currency",
          showSparkline: false,
          showDelta: true,
          highlightTopN: 3,
          rankColor: "info",
          badgeColor: "info",
        }),
      ),
  );

  static staticRow = Grid({ gap: "1rem" }).child(
    "staticTopRow",
    GridRow()
      .child(
        "static",
        TopListCard({
          title: "Top fournisseurs (statique)",
          description: "Données figées, sans periodScope",
          valueFormat: "currency",
          showDelta: true,
          showSparkline: true,
          staticItems: [
            {
              id: 1,
              title: "Acme Components",
              description: "Composants électroniques",
              value: 124800,
              delta: 12.4,
              sparkline: [80, 95, 88, 110, 120, 124],
              icon: "i-lucide-package",
            },
            {
              id: 2,
              title: "Globex Industries",
              description: "Métallurgie",
              value: 98600,
              delta: -3.2,
              sparkline: [110, 105, 102, 98, 99, 98],
              icon: "i-lucide-factory",
            },
            {
              id: 3,
              title: "Initech",
              description: "Logiciels",
              value: 76200,
              delta: 5.1,
              sparkline: [70, 72, 70, 73, 75, 76],
              icon: "i-lucide-code",
            },
            {
              id: 4,
              title: "Soylent Corp",
              description: "Sans delta ni sparkline",
              value: 51000,
              icon: "i-lucide-leaf",
            },
          ],
        }),
      )
      .child(
        "noRankNoDelta",
        TopListCard({
          title: "Sans rang, sans trend",
          description: "showRank=false, showDelta=false",
          valueFormat: "compact",
          showRank: false,
          showDelta: false,
          showSparkline: true,
          staticItems: [
            {
              id: 1,
              title: "Page d'accueil",
              value: 18420,
              sparkline: [10, 12, 14, 13, 15, 18],
            },
            {
              id: 2,
              title: "Catalogue",
              value: 12200,
              sparkline: [10, 11, 11, 10, 12, 12],
            },
            {
              id: 3,
              title: "Blog",
              value: 8900,
              sparkline: [12, 10, 9, 9, 10, 9],
            },
            {
              id: 4,
              title: "Contact",
              value: 4100,
              sparkline: [4, 4, 4, 5, 4, 4],
            },
          ],
        }),
      ),
  );
}
