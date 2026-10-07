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
      "Nuxt UI primitives as the v2 theme draws them: stepper, pagination, field variants, checkbox / radio cards, switch states, horizontal navigation, pin input, tree, chip, separator, empty state, link and table",
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
