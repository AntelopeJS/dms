import { modulesCategory, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";

@RegisterPage()
export class ModulesIndexPage extends modulesCategory {
  static content = CustomComponent("DmsModules").meta({
    name: "$modules.title",
    icon: "i-ph-squares-four",
  });
}
