import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { EmptyLayout } from "@antelopejs/interface-dms/base/layouts";

@RegisterPage()
export class BackupCodePage extends PageController(
  "auth-backup",
  {
    displayName: "$page.backup.title",
    urlSlug: "auth/backup",
    publicAccess: true,
    hidden: true,
    category: pagesCategory,
  },
  EmptyLayout(),
) {
  static content = CustomComponent("DmsAuthBackup");
}
