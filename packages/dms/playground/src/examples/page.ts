import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { examplesCategory } from "./category";

@RegisterPage()
export class ExamplesOverviewPage extends PageController("overview", {
  displayName: "Overview",
  icon: "i-ph-flask",
  category: examplesCategory,
  order: 0,
  description: "A page living under a custom top-level RootCategory group",
}) {}
