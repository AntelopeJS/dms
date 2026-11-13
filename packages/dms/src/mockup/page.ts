import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { PREVIEW_LAYOUT } from "../pages/public/preview";

/**
 * `/mockup`: the viewer of `mockups/<name>/spec.json`, drawing each page with
 * `/dms-preview` and redrawing it on every save. Hidden and owner-only, like
 * the `/api/mockup` routes it reads; `?name=`, `?page=` and `?width=` pick what
 * it shows.
 */
export class MockupPage extends PageController(
  "mockup",
  {
    displayName: "Mockup",
    urlSlug: "mockup",
    hidden: true,
    ownerOnly: true,
    category: pagesCategory,

    live: {},
  },
  PREVIEW_LAYOUT,
) {
  static content = CustomComponent("DmsMockupViewer");
}

/**
 * Registers `/mockup`. Only called in development, which is why the page
 * carries no decorator: importing this file registers nothing.
 */
export function registerMockupPage(): void {
  RegisterPage()(MockupPage);
}
