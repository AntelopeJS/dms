import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";

@RegisterPage()
export class PlainModuleInfoPage extends PageController("info", {
  displayName: "Info",
  icon: "i-ph-info",
  module: "plain",
  order: 0,
  description:
    "Demonstrates: a module without defaultCategory, whose pages fall back to the generic Pages group.",
}) {}
