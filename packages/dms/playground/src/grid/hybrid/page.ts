import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";
import { pageCategory } from "../category";

@RegisterPage()
export class PageLayoutGridHybrid extends PageController("layout-grid-hybrid", {
  displayName: "Hybrid Grid Layout",
  icon: "i-ph-layout",
  category: pageCategory,
  order: 20,
  description: "Grid with element on left and nested Grid components on right",
}) {
  static mainGrid = Grid({ gap: "1rem" }).child(
    "row1",
    GridRow()
      .child(
        "mainElement",
        Placeholder({ label: "Main Element", height: "300px" }),
      )
      .child(
        "nestedGrid",
        Grid({ gap: "0" })
          .child(
            "nestedRow1",
            GridRow().child(
              "nestedEl1",
              Placeholder({ label: "Nested Element 1", height: "150px" }),
              { colSpan: 2 },
            ),
          )
          .child(
            "nestedRow2",
            GridRow()
              .child(
                "nestedEl2",
                Placeholder({ label: "Nested Element 2", height: "150px" }),
              )
              .child(
                "nestedEl3",
                Placeholder({ label: "Nested Element 3", height: "150px" }),
              ),
          ),
      ),
  );
}
