import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";

/**
 * `/branding`: the editor of the platform's theme. Hidden from the menu and
 * out of every role's reach but the platform owner's, who holds every
 * permission; it draws its own top bar, so the layout has no header.
 */
export class BrandingPage extends PageController(
  "branding",
  {
    displayName: "Branding",
    urlSlug: "branding",
    hidden: true,
    noComponentPermissions: true,
    category: pagesCategory,
  },
  DefaultLayout({ hideHeader: true, fillHeight: true }),
) {
  static content = CustomComponent("DmsBrandingEditor");
}

/**
 * Registers `/branding`. Only called in development, which is why the page
 * carries no decorator: importing this file registers nothing.
 */
export function registerBrandingPage(): void {
  RegisterPage()(BrandingPage);
}
