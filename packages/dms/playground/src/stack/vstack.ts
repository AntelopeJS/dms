import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Placeholder, VStack } from "@antelopejs/interface-dms/base";
import { stackCategory } from "./category";

@RegisterPage()
export class PageVStack extends PageController("stack-vstack", {
  displayName: "VStack Examples",
  icon: "i-ph-columns",
  category: stackCategory,
  order: 10,
  description: "Vertical Stack - Arrange components top to bottom",
}) {
  static alignStart = VStack({ alignment: "start" })
    .child("ex1", Placeholder({ label: "Align Start", height: "100px" }))
    .child("ex2", Placeholder({ height: "100px" }));

  static alignCenter = VStack({ alignment: "center" })
    .child("ex1", Placeholder({ label: "Align Center", height: "100px" }))
    .child("ex2", Placeholder({ height: "100px" }));

  static alignEnd = VStack({ alignment: "end" })
    .child("ex1", Placeholder({ label: "Align End", height: "100px" }))
    .child("ex2", Placeholder({ height: "100px" }));

  static alignStretch = VStack({ alignment: "stretch" })
    .child("ex1", Placeholder({ label: "Align Stretch", height: "100px" }))
    .child("ex2", Placeholder({ height: "100px" }));
}
