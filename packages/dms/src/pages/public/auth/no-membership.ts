import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { EmptyLayout } from "@antelopejs/interface-dms/base/layouts";

@RegisterPage()
export class NoMembershipPage extends PageController(
  "auth-no-membership",
  {
    displayName: "$page.no_membership.title",
    urlSlug: "auth/no-membership",
    publicAccess: true,
    hidden: true,
    category: pagesCategory,
  },
  EmptyLayout(),
) {
  static content = CustomComponent("DmsAuthNoMembership");
}
