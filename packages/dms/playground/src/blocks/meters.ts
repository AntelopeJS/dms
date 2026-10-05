import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Meter } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { blocksCategory } from "./category";

@RegisterPage()
export class PageBlocksMeters extends PageController("blocks-meters", {
  displayName: "Meter",
  icon: "i-ph-gauge",
  category: blocksCategory,
  order: 50,
  description:
    "Meter block: stacked segments with a legend, value formats, warning and error thresholds, sizes, live figures",
}) {
  static usage = Grid({ gap: "1rem", minColumnWidth: "300px" })
    .child(
      "row1",
      GridRow()
        .child(
          "seats",
          Meter({
            card: true,
            label: "Seats",
            hint: "8 in use · 2 free",
            max: 10,
            segments: [
              { value: 6, label: "6 members" },
              { value: 2, tone: "soft", label: "2 pending invites" },
            ],
            legend: true,
            actions: [
              { label: "Manage members", to: "/settings/user/members" },
            ],
          }),
        )
        .child(
          "live",
          Meter({
            card: true,
            label: "Seats (live)",
            fetchUrl: "/api/blocks-feed/seats",
            legend: true,
          }),
        ),
    )
    .child(
      "row2",
      GridRow()
        .child(
          "storage",
          Meter({
            card: true,
            label: "Storage",
            hint: "38.2 of 50 GB",
            value: 76.4,
            max: 100,
            format: "percent",
            warnAt: 75,
            errorAt: 95,
          }),
        )
        .child(
          "quota",
          Meter({
            card: true,
            label: "API calls this month",
            value: 98200,
            max: 100000,
            warnAt: 75,
            errorAt: 95,
            size: "md",
          }),
        )
        .child(
          "coverage",
          Meter({
            card: true,
            label: "Permission coverage",
            value: 42,
            max: 669,
            format: "value",
            size: "xs",
          }),
        ),
    );
}
