import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { EmptyLayout } from "@antelopejs/interface-dms/base/layouts";

@RegisterPage()
export class SignupPage extends PageController(
  "auth-signup",
  {
    displayName: "$page.signup.create_account_title",
    urlSlug: "auth/signup",
    publicAccess: true,
    hidden: true,
    category: pagesCategory,
  },
  EmptyLayout(),
) {
  static content = CustomComponent("DmsAuthSignup");
}
