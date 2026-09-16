import { RegisterPage, settingsCategory } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";

@RegisterPage()
export class SettingsIndexPage extends settingsCategory {
  static content = CustomComponent("DmsSettings").meta({
    name: "$page.settings.title",
    icon: "i-ph-gear",
  });
}
