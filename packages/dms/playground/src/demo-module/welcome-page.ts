import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";

@RegisterPage()
export class DemoModuleWelcomePage extends PageController("welcome", {
  displayName: "Welcome",
  icon: "i-ph-house",
  module: "demo",
  order: 0,
  description: "Welcome page of the demo module",
}) {}
