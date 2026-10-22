import {
  modulesCategory,
  PageController,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";

/**
 * The module store, its own view under the Modules page (`/modules/store`):
 * out of the menu, opened from the Modules page's header. Owner-only like
 * the Modules page, which the custom page enforces.
 */
@RegisterPage()
export class ModulesStorePage extends PageController("store", {
  displayName: "$modules.store.title",
  description: "$modules.store.description",
  urlSlug: "store",
  icon: "i-ph-storefront",
  hidden: true,
  noComponentPermissions: true,
  category: modulesCategory,
}) {
  static content = CustomComponent("DmsModulesStore").meta({
    name: "$modules.store.title",
    icon: "i-ph-storefront",
  });
}
