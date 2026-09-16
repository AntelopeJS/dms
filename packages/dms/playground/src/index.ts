import path from "node:path";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import "./demo-module";
import "./plain-module";
import "./examples";
import "./flow-canvas";
import "./drawer-modal";
import "./form";
import "./table-view";
import "./tree";
import "./tabs";
import "./grid";
import "./chart";
import "./multi-component";
import "./navigation";
import "./stack";
import "./nested";
import "./notification";
import "./page-extension";
import "./invite-extension";
import "./quick-actions";

/** Registers the playground's Vue frontend extensions. */
export async function start() {
  await AddFrontendModule({
    name: "playground-frontend",
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    priority: 100,
    options: { dmsI18nAppLayer: true },
  });
}
