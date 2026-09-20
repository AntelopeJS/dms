import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { KpiCard } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";
import { pageCategory } from "../category";

const GRID_GAP = "1rem";
const PLACEHOLDER_HEIGHT = "100px";

const kpi = (title: string, icon: string, value: number, delta: number) =>
  KpiCard({
    title,
    icon,
    valueFormat: "compact",
    staticValue: value,
    staticDelta: delta,
    compareLabel: "vs previous period",
  });

/**
 * The narrow-viewport stress case: six KPI cards on a single row, the shape
 * every module overview page uses. It is the page that shows whether the grid
 * still gives each child a usable width once the viewport is a phone's.
 */
@RegisterPage()
export class PageGridDense extends PageController("grid-dense", {
  displayName: "Dense Grid (6 KPI)",
  icon: "i-ph-squares-four",
  category: pageCategory,
  order: 40,
  description: "Six KPI cards on one row, plus a wide row to pair against",
}) {
  static kpis = Grid({ gap: GRID_GAP }).child(
    "row",
    GridRow()
      .child("sends", kpi("Sends", "i-ph-paper-plane-tilt", 128400, 4.2))
      .child(
        "deliverability",
        kpi("Deliverability", "i-ph-check-circle", 98, 0.4),
      )
      .child("openRate", kpi("Open rate", "i-ph-envelope-open", 42, -1.8))
      .child("clickRate", kpi("Click rate", "i-ph-cursor-click", 12, 2.6))
      .child("bounces", kpi("Bounces", "i-ph-arrow-u-up-left", 1420, -9.1))
      .child("unsubscribes", kpi("Unsubscribes", "i-ph-user-minus", 318, -3.3)),
  );

  static mixedRows = Grid({ gap: GRID_GAP })
    .child(
      "wide",
      GridRow()
        .child("a", Placeholder({ label: "A", height: PLACEHOLDER_HEIGHT }))
        .child("b", Placeholder({ label: "B", height: PLACEHOLDER_HEIGHT }))
        .child("c", Placeholder({ label: "C", height: PLACEHOLDER_HEIGHT }))
        .child("d", Placeholder({ label: "D", height: PLACEHOLDER_HEIGHT })),
    )
    .child(
      "narrow",
      GridRow()
        .child("e", Placeholder({ label: "E", height: PLACEHOLDER_HEIGHT }))
        .child("f", Placeholder({ label: "F", height: PLACEHOLDER_HEIGHT })),
    );
}
