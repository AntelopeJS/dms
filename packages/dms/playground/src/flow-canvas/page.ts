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
      "DmsFlowCanvas, the DMS-themed Vue Flow wrapper: custom nodes, animated edges, minimap, zoom readout and deletable nodes. Drag a handle to connect two nodes, switch the grid, or delete a node with Backspace",
    icon: "i-ph-graph",
    category: flowCanvasCategory,
    order: 0,
  },
  DefaultLayout({ hideHeader: true, fullWidth: true, fillHeight: true }),
) {
  static content = CustomComponent("FlowCanvasDemo").meta({
    name: "Flow Canvas",
    icon: "i-ph-graph",
  });
}
