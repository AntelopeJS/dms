import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  HStack,
  Placeholder,
  Spacer,
  VStack,
} from "@antelopejs/interface-dms/base";
import { stackCategory } from "./category";

@RegisterPage()
export class PageHStack extends PageController("stack-hstack", {
  displayName: "HStack Examples",
  icon: "i-ph-rows",
  category: stackCategory,
  order: 0,
  description: "Horizontal Stack - Arrange components side by side",
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
}
