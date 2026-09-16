import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Spacer } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";
import { pageCategory } from "../category";

@RegisterPage()
export class PageLayoutGridStacked extends PageController(
  "layout-grid-stacked",
  {
    displayName: "Stacked with Grid Component",
    icon: "i-ph-stack",
    category: pageCategory,
    order: 10,
    description:
      "Grid component with multiple elements in different row layouts",
  },
) {
  static simpleGrid = Grid({ gap: "1.5rem" })
    .child(
      "row1",
      GridRow()
        .child("el1", Placeholder({ label: "Element 1", height: "120px" }))
        .child("spacer1", Spacer())
        .child(
          "el2",
          Placeholder({ label: "Element 2 (spaced)", height: "120px" }),
        ),
    )
    .child(
      "row2",
      GridRow()
        .child("el3", Placeholder({ label: "Element 3", height: "120px" }))
        .child("el4", Placeholder({ label: "Element 4", height: "120px" }))
        .child("el5", Placeholder({ label: "Element 5", height: "120px" })),
    )
    .child(
      "row3",
      GridRow().child(
        "el6",
        Placeholder({ label: "Element 6 (Full Width)", height: "120px" }),
        { colSpan: 3 },
      ),
    );
}
