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
  description:
    "Spacer fills the free space of a stack: pushing blocks apart, centring one, capped by maxSize, kept above minSize, and shared by grow (1 against 3).",
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

    // minSize keeps at least 120 px between A and B, however narrow the row.
    const example7 = HStack({ spacing: "0", alignment: "center" })
      .child("a", Placeholder({ label: "A", height: "100px", width: "120px" }))
      .child("spacer", Spacer({ minSize: "120px" }))
      .child("b", Placeholder({ label: "B", height: "100px", width: "120px" }));

    // grow 1 against grow 3: the second gap takes three times the first.
    const example8 = HStack({ spacing: "0", alignment: "center" })
      .child("a", Placeholder({ label: "A", height: "100px", width: "100px" }))
      .child("grow1", Spacer({ grow: 1 }))
      .child("b", Placeholder({ label: "B", height: "100px", width: "100px" }))
      .child("grow3", Spacer({ grow: 3 }))
      .child("c", Placeholder({ label: "C", height: "100px", width: "100px" }));

    return VStack({ spacing: "32px", alignment: "stretch" })
      .child("ex1", example1)
      .child("ex2", example2)
      .child("ex3", example3)
      .child("ex4", example4)
      .child("ex5", example5)
      .child("ex6", example6)
      .child("ex7", example7)
      .child("ex8", example8);
  })();
}
