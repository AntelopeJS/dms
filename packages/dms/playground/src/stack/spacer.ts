import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  HStack,
  Placeholder,
  Spacer,
  VStack,
} from "@antelopejs/interface-dms/base";
import { stackCategory } from "./category";

@RegisterPage()
export class PageSpacer extends PageController("stack-spacer", {
  displayName: "Spacer Examples",
  icon: "i-ph-arrow-line-right",
  category: stackCategory,
  order: 20,
  description: "Spacer - Fill available space between components",
}) {
  static mainContent = (() => {
    const leftBox = Placeholder({
      label: "Left",
      height: "100px",
      width: "150px",
    });
    const rightBox = Placeholder({
      label: "Right",
      height: "100px",
      width: "150px",
    });

    const example1 = HStack({ spacing: "16px", alignment: "center" })
      .child("left", leftBox)
      .child("spacer", Spacer())
      .child("right", rightBox);

    const topBox = Placeholder({ label: "Top", height: "80px" });
    const bottomBox = Placeholder({ label: "Bottom", height: "80px" });

    const example2 = VStack({ spacing: "16px", alignment: "stretch" })
      .child("top", topBox)
      .child("spacer", Spacer())
      .child("bottom", bottomBox);

    const centerBox = Placeholder({
      label: "Centered",
      height: "100px",
      width: "200px",
    });

    const example3 = HStack({ spacing: "16px", alignment: "center" })
      .child("spacer1", Spacer())
      .child("center", centerBox)
      .child("spacer2", Spacer());

    const box1 = Placeholder({
      label: "Box 1",
      height: "100px",
      width: "150px",
    });
    const box2 = Placeholder({
      label: "Box 2",
      height: "100px",
      width: "150px",
    });

    const example4 = HStack({ spacing: "16px", alignment: "center" })
      .child("item1", box1)
      .child("spacer", Spacer({ maxSize: "100px" }))
      .child("item2", box2);

    const boxA = Placeholder({ label: "A", height: "100px", width: "120px" });
    const boxB = Placeholder({ label: "B", height: "100px", width: "120px" });
    const boxC = Placeholder({ label: "C", height: "100px", width: "120px" });

    const example5 = HStack({ spacing: "0", alignment: "center" })
      .child("a", boxA)
      .child("spacer1", Spacer())
      .child("b", boxB)
      .child("spacer2", Spacer())
      .child("c", boxC);

    const example6 = HStack({ spacing: "0", alignment: "center" })
      .child("spacer", Spacer())
      .child("right", rightBox);

    return VStack({ spacing: "32px", alignment: "stretch" })
      .child("ex1", example1)
      .child("ex2", example2)
      .child("ex3", example3)
      .child("ex4", example4)
      .child("ex5", example5)
      .child("ex6", example6);
  })();
}
