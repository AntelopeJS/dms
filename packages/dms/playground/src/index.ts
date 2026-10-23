import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import { frontendModule } from "./frontend-module";
import "./demo-module";
import "./plain-module";
import "./examples";
import "./feature-index";
import "./flow-canvas";
import "./drawer-modal";
import "./form";
import "./table-view";
import "./tabs";
import "./grid";
import "./chart";
import "./blocks";
import "./multi-component";
import "./navigation";
import "./stack";
import "./nested";
import "./notification";
import "./page-extension";
import "./quick-actions";
import "./primitives";
import "./foundations";
import "./frontend-modules";
import "./page-header";
import "./layout-banners";
import "./tenancy";
import "./hooks";
import "./page-access";
import "./realtime";
import "./emails";
import "./permissions";

/** Registers the playground's Vue frontend extensions. */
export async function start() {
  await AddFrontendModule(frontendModule());
}
