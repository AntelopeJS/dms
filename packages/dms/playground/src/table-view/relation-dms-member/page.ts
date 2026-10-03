import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { relDmsAssignDataAPI } from "./data-api";
import { demoFormTexts } from "../form-texts";

@RegisterPage()
export class PageTableViewRelationDmsMember extends PageController(
  "table-view-relation-dms-member",
  {
    displayName: "Relation · DMS Member (tenant)",
    icon: "i-ph-user-circle",
    category: tableViewCategory,
    order: 121,
    description:
      "Tenant-scoped relation to the real DMS members (memberSettingDataAPI): their @Joined name resolves in the list. The table starts empty, as tenant rows are created at runtime: add an assignment to pick a member.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(relDmsAssignDataAPI, {
    caption: "Assignments → real DMS member (tenant-scoped)",
    labelKey: "label",
    formTexts: demoFormTexts("member_assignment"),
    rowActions: {
      add: true,
      copyLink: false,
      delete: true,
      details: true,
      duplicate: true,
      edit: true,
      hasSelection: false,
    },
  });
}
