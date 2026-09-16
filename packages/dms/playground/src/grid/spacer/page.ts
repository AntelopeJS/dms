import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";
import { Spacer } from "@antelopejs/interface-dms/base/stack";
import { pageCategory } from "../category";

@RegisterPage()
export class PageGridSpacer extends PageController("grid-spacer", {
  displayName: "Grid with Spacer & ColSpan",
  icon: "i-ph-columns",
  category: pageCategory,
  order: 30,
  description: "Grid layout demonstrating Spacer and colSpan features",
}) {
  static grid = Grid({ gap: "1rem" })
    .child(
      "row1",
      GridRow()
        .child("el1", Placeholder({ label: "Element 1", height: "100px" }))
        .child("spacer1", Spacer(), { colSpan: 2 })
        .child("el2", Placeholder({ label: "Element 2", height: "100px" }))
        .child("el3", Placeholder({ label: "Element 3", height: "100px" })),
    )
    .child(
      "row2",
      GridRow()
        .child("spacer2", Spacer())
        .child(
          "el4",
          Placeholder({ label: "Element 4 (span 2)", height: "100px" }),
          { colSpan: 2 },
        )
        .child(
          "el5",
          Placeholder({ label: "Element 5 (span 2)", height: "100px" }),
          { colSpan: 2 },
        ),
    )
    .child(
      "row3",
      GridRow()
        .child(
          "el6",
          Placeholder({ label: "Element 6 (span 3)", height: "100px" }),
          { colSpan: 3 },
        )
        .child("el7", Placeholder({ label: "Element 7", height: "100px" }))
        .child("el8", Placeholder({ label: "Element 8", height: "100px" })),
    );
}
