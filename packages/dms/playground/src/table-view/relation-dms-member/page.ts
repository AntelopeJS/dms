import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { relDmsAssignDataAPI } from "./data-api";
import { demoFormPages } from "../form-texts";

@RegisterPage()
export class PageTableViewRelationDmsMember extends PageController(
  "table-view-relation-dms-member",
  {
    displayName: "Relation · DMS Member (tenant)",
    icon: "i-ph-user-circle",
    category: tableViewCategory,
    order: 121,
    description:
      "A tenant-scoped relation to the real DMS members, their name resolved in the list. It starts empty (emptyStates.firstRun): add an assignment to pick a member.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(relDmsAssignDataAPI, {
    caption: "Assignments → real DMS member (tenant-scoped)",
    labelKey: "label",
    formContainer: { type: "page", pages: demoFormPages("member_assignment") },
    emptyStates: {
      firstRun: {
        title: "No assignment yet",
        description:
          "Assign a real DMS member to a label to see the relation resolve.",
        icon: "i-ph-user-plus",
      },
    },
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
