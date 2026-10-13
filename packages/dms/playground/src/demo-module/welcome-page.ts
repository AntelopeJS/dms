import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { KeyValueList } from "@antelopejs/interface-dms/base";

@RegisterPage()
export class DemoModuleWelcomePage extends PageController("welcome", {
  displayName: "Welcome",
  icon: "i-ph-house",
  module: "demo",
  order: 0,
  description:
    "Demonstrates: RegisterModule and the module sidebar. The module opens on Contact Form (landingPage), not on this first page.",
}) {
  static module = KeyValueList({
    title: "What this module shows",
    items: [
      {
        label: 'landingPage: "contact"',
        value: "/modules/demo opens Contact Form",
        detail:
          "Without it, the module opens on its first page by order: this one.",
      },
      {
        label: "defaultCategory",
        value: "Demo Pages",
        detail: "Groups the pages that declare module but no category.",
      },
      {
        label: "In-module category",
        value: "Tools",
        detail:
          'A Category({ module: "demo" }) of its own, under the default one.',
      },
      {
        label: "Module-scoped sidebar widget",
        value: "SidebarWidgetModuleDemo",
        detail: "Shows only inside this module's sidebar.",
      },
      {
        label: "Catalog tile",
        value: "version, catalogCategory, status, readout",
        type: "link",
        to: "/modules",
        detail:
          "Open the module catalog: the Plain Module's state changes at every load.",
      },
    ],
  });
}
