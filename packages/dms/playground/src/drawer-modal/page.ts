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
      "Public useDrawer() / useModal() composables opening DMS-themed containers from a consumer module",
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
