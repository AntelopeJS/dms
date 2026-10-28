import {
  Category,
  PageController,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { KeyValueList } from "@antelopejs/interface-dms/base";

export const demoToolsCategory = Category("tools", {
  displayName: "Tools",
  icon: "i-ph-wrench",
  order: 10,
  module: "demo",
});

@RegisterPage()
export class DemoModuleToolsPage extends PageController("diagnostics", {
  displayName: "Diagnostics",
  icon: "i-ph-stethoscope",
  module: "demo",
  category: demoToolsCategory,
  order: 0,
  description:
    "Demonstrates: a module page filed under an in-module Category instead of the module's default category.",
}) {
  static info = KeyValueList({
    title: "Where this page sits",
    items: [
      {
        label: "Category",
        value: 'Category("tools", { module: "demo" })',
        type: "mono",
      },
      {
        label: "Page",
        value: 'PageController("diagnostics", { module: "demo", category })',
        type: "mono",
      },
    ],
  });
}
