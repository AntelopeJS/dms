import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { flowCanvasCategory } from "./category";

@RegisterPage()
export class PageFlowCanvasDemo extends PageController(
  "demo",
  {
    displayName: "Flow Canvas",
    description:
      "Generic DMS-themed Vue Flow wrapper (DmsFlowCanvas): custom node slot, animated edges, minimap, controls, fit-view, deletable nodes (badge + Delete/Backspace) and a live zoom readout",
    icon: "i-ph-graph",
    category: flowCanvasCategory,
    order: 0,
  },
  DefaultLayout({ hideHeader: true, fullWidth: true }),
) {
  static content = CustomComponent("FlowCanvasDemo").meta({
    name: "Flow Canvas",
    icon: "i-ph-graph",
  });
}
