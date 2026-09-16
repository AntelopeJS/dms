import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";

@RegisterPage()
export class PlainModuleInfoPage extends PageController("info", {
  displayName: "Info",
  icon: "i-ph-info",
  module: "plain",
  order: 0,
  description: "A loose page rendered under the fallback Pages group",
}) {}
