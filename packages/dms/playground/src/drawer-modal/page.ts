import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { drawerModalCategory } from "./category";

@RegisterPage()
export class PageDrawerModalDemo extends PageController(
  "demo",
  {
    displayName: "Drawer & Modal",
    description:
      "useDrawer() and useModal() open DMS-themed containers from a module's code. Pick a drawer edge or a modal size and open one; a third modal counts down with patch() and closes itself",
    icon: "i-ph-cards",
    category: drawerModalCategory,
    order: 0,
  },
  DefaultLayout({}),
) {
  static content = CustomComponent("DrawerModalDemo").meta({
    name: "Drawer & Modal",
    icon: "i-ph-cards",
  });
}
