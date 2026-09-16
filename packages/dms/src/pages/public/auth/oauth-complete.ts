import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { EmptyLayout } from "@antelopejs/interface-dms/base/layouts";

@RegisterPage()
export class OAuthCompletePage extends PageController(
  "auth-oauth-complete",
  {
    displayName: "$page.auth.oauth.completing",
    urlSlug: "auth/oauth/complete",
    publicAccess: true,
    hidden: true,
    category: pagesCategory,
  },
  EmptyLayout(),
) {
  static content = CustomComponent("DmsAuthOauthComplete");
}
