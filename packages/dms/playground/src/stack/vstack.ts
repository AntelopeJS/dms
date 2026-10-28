import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  HStack,
  Placeholder,
  type StackDistribution,
  VStack,
} from "@antelopejs/interface-dms/base";
import { stackCategory } from "./category";

const COLUMN_HEIGHT = "300px";
const ITEM_HEIGHT = "50px";
const COLUMN_DISTRIBUTIONS: StackDistribution[] = [
  "start",
  "center",
  "end",
  "space-between",
  "space-evenly",
];

const RULER_WIDTH = "112px";

function distributedColumn(distribution: StackDistribution) {
  return VStack({ distribution, alignment: "stretch", spacing: "8px" })
    .child("label", Placeholder({ label: distribution, height: ITEM_HEIGHT }))
    .child("a", Placeholder({ label: "A", height: ITEM_HEIGHT }));
}

function distributedColumns() {
  return COLUMN_DISTRIBUTIONS.reduce(
    (row, distribution) =>
      row.child(distribution, distributedColumn(distribution)),
    HStack({ alignment: "stretch", spacing: "12px" }).child(
      "ruler",
      Placeholder({
        label: "300",
        height: COLUMN_HEIGHT,
        width: RULER_WIDTH,
      }),
    ),
  );
}

@RegisterPage()
export class PageVStack extends PageController("stack-vstack", {
  displayName: "VStack Examples",
  icon: "i-ph-columns",
  category: stackCategory,
  order: 10,
  description:
    "VStack stacks blocks top to bottom: the four alignments, then the vertical distributions inside a 300 px tall row.",
}) {
  static alignStart = VStack({ alignment: "start" })
    .child("ex1", Placeholder({ label: "Align Start", height: "100px" }))
    .child("ex2", Placeholder({ label: "Second block", height: "100px" }));

  static alignCenter = VStack({ alignment: "center" })
    .child("ex1", Placeholder({ label: "Align Center", height: "100px" }))
    .child("ex2", Placeholder({ label: "Second block", height: "100px" }));

  static alignEnd = VStack({ alignment: "end" })
    .child("ex1", Placeholder({ label: "Align End", height: "100px" }))
    .child("ex2", Placeholder({ label: "Second block", height: "100px" }));

  static alignStretch = VStack({ alignment: "stretch" })
    .child("ex1", Placeholder({ label: "Align Stretch", height: "100px" }))
    .child("ex2", Placeholder({ label: "Second block", height: "100px" }));

  static distributions = distributedColumns();
}
