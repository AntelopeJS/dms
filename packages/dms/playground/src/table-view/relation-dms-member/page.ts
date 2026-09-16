import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { relDmsAssignDataAPI } from "./data-api";

@RegisterPage()
export class PageTableViewRelationDmsMember extends PageController(
  "table-view-relation-dms-member",
  {
    displayName: "Relation · DMS Member (tenant)",
    icon: "i-ph-user-circle",
    category: tableViewCategory,
    order: 91,
    description:
      "Tenant-scoped relation to the REAL DMS member (memberSettingDataAPI). Same instance as the member, so the @Joined `name` label resolves in list — the omnitec scenario. Use + New to assign a member (the table starts empty: tenant rows are created at runtime, not seeded).",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(relDmsAssignDataAPI, {
    caption: "Assignments → real DMS member (tenant-scoped)",
    labelKey: "label",
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
