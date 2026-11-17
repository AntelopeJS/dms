import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { EmptyLayout } from "@antelopejs/interface-dms/base/layouts";

/**
 * Where a sign-in that answers `requires_tenant_assignment` lands when no
 * module serves `/auth/no-workspace`. It has its own slug so that a module
 * page on `/auth/no-workspace` never races it.
 */
@RegisterPage()
export class NotAMemberPage extends PageController(
  "auth-not-a-member",
  {
    displayName: "$page.no_workspace.title",
    description: "$page.no_workspace.description",
    urlSlug: "auth/not-a-member",
    publicAccess: true,
    hidden: true,
    category: pagesCategory,
  },
  EmptyLayout(),
) {
  static content = CustomComponent("DmsAuthNotAMember");
}
