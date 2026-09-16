import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { userCategory } from "./category";

@RegisterPage()
export class ShortcutsSettingsController extends PageController(
  "shortcuts",
  {
    displayName: "$menu.shortcuts",
    category: userCategory,
    icon: "i-ph-keyboard",
    order: 3,
    description: "$page.settings.description.shortcuts",
  },
  FormPageLayout(),
) {
  static shortcutsComponent = CustomComponent("DmsSettingsShortcuts").meta({
    name: "$menu.shortcuts",
    icon: "i-ph-keyboard",
  });
}
