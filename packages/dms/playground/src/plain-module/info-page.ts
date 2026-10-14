import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { KeyValueList } from "@antelopejs/interface-dms/base";

@RegisterPage()
export class PlainModuleInfoPage extends PageController("info", {
  displayName: "Info",
  icon: "i-ph-info",
  module: "plain",
  order: 0,
  description:
    "Demonstrates: a module without defaultCategory, whose pages fall back to the generic Pages group.",
}) {
  static module = KeyValueList({
    title: "What this module shows",
    items: [
      {
        label: "No defaultCategory",
        value: "Pages",
        detail:
          "Its loose pages sit under the generic Pages heading of the module sidebar.",
      },
      {
        label: "No landingPage",
        value: "/modules/plain opens Info",
        detail: "The module opens on its first page by order: this one.",
      },
      {
        label: "Catalog status",
        value: "beta, update, attention",
        type: "link",
        to: "/modules",
        detail:
          "status() reports the next state at every catalog load: reload the catalog to see the pill change.",
      },
    ],
  });
}
