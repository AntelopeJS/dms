import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { primitivesCategory } from "./category";

@RegisterPage()
export class PagePrimitivesShowcase extends PageController(
  "showcase",
  {
    displayName: "Themed Nuxt UI",
    description:
      "Nuxt UI primitives as the DMS theme draws them: stepper, pagination, fields, choice cards, switches, navigation, pin input, tree, chip, link and table. Compare them with the DMS components of Foundations",
    icon: "i-ph-swatches",
    category: primitivesCategory,
    order: 0,
  },
  DefaultLayout({}),
) {
  static content = CustomComponent("PrimitivesShowcase").meta({
    name: "Primitives",
    icon: "i-ph-swatches",
  });
}
