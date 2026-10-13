import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  HStack,
  Placeholder,
  Spacer,
  type StackDistribution,
  VStack,
} from "@antelopejs/interface-dms/base";
import { stackCategory } from "./category";

const DISTRIBUTIONS: StackDistribution[] = [
  "start",
  "center",
  "end",
  "space-between",
  "space-around",
  "space-evenly",
];
const SMALL_BOX_WIDTH = "80px";
const SMALL_BOX_HEIGHT = "60px";
const WRAPPED_BOX_COUNT = 10;
const WRAPPED_BOX_WIDTH = "120px";

function smallBox(label: string) {
  return Placeholder({
    label,
    width: SMALL_BOX_WIDTH,
    height: SMALL_BOX_HEIGHT,
  });
}

// Three narrow boxes per row, so the leftover width shows where each
// distribution puts it.
function distributionRow(distribution: StackDistribution) {
  return HStack({ distribution, spacing: "8px", alignment: "center" })
    .child(
      "label",
      Placeholder({
        label: distribution,
        height: SMALL_BOX_HEIGHT,
        width: "140px",
      }),
    )
    .child("a", smallBox("A"))
    .child("b", smallBox("B"))
    .child("c", smallBox("C"));
}

function distributionRows() {
  return DISTRIBUTIONS.reduce(
    (stack, distribution) =>
      stack.child(distribution, distributionRow(distribution)),
    VStack({ spacing: "12px", alignment: "stretch" }),
  );
}

function wrappedRow() {
  return Array.from(
    { length: WRAPPED_BOX_COUNT },
    (_, index) => index + 1,
  ).reduce(
    (stack, index) =>
      stack.child(
        `box${index}`,
        Placeholder({
          label: `${index}`,
          width: WRAPPED_BOX_WIDTH,
          height: SMALL_BOX_HEIGHT,
        }),
      ),
    HStack({ wrap: true, spacing: "12px" }),
  );
}

@RegisterPage()
export class PageHStack extends PageController("stack-hstack", {
  displayName: "HStack Examples",
  icon: "i-ph-rows",
  category: stackCategory,
  order: 0,
  description:
    "HStack places blocks side by side: alignment, spacing, the six distributions of the leftover width, and wrap onto several lines. Narrow the window to see the wrapped row break.",
}) {
  static mainContent = (() => {
    const item1 = Placeholder({ label: "Item 1", height: "150px" });
    const item2 = Placeholder({ label: "Item 2", height: "150px" });
    const item3 = Placeholder({ label: "Item 3", height: "150px" });

    const example1 = HStack({ spacing: "16px", alignment: "center" })
      .child("item1", item1)
      .child("item2", item2)
      .child("item3", item3);

    const leftBox = Placeholder({
      label: "Left Item",
      height: "150px",
      width: "200px",
    });
    const rightBox = Placeholder({
      label: "Right Item",
      height: "150px",
      width: "200px",
    });

    const example2 = HStack({ spacing: "16px", alignment: "center" })
      .child("left", leftBox)
      .child("spacer", Spacer())
      .child("right", rightBox);

    const boxA = Placeholder({ label: "Box A", height: "150px" });
    const boxB = Placeholder({ label: "Box B", height: "150px" });
    const boxC = Placeholder({ label: "Box C", height: "150px" });

    const example3 = HStack({ spacing: "32px", alignment: "center" })
      .child("a", boxA)
      .child("b", boxB)
      .child("c", boxC);

    const tallBox = Placeholder({ label: "Tall", height: "200px" });
    const shortBox = Placeholder({ label: "Short", height: "100px" });
    const mediumBox = Placeholder({ label: "Medium", height: "150px" });

    const example4 = HStack({ spacing: "16px", alignment: "stretch" })
      .child("tall", tallBox)
      .child("short", shortBox)
      .child("medium", mediumBox);

    return VStack({ spacing: "32px", alignment: "stretch" })
      .child("ex1", example1)
      .child("ex2", example2)
      .child("ex3", example3)
      .child("ex4", example4);
  })();

  static distributions = distributionRows();

  static wrapped = wrappedRow();
}
