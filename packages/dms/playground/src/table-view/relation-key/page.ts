import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { relAssignDataAPI } from "./data-api";

@RegisterPage()
export class PageTableViewRelationKey extends PageController(
  "table-view-relation-key",
  {
    displayName: "Relation · Key (repro)",
    icon: "i-ph-link",
    category: tableViewCategory,
    order: 90,
    description:
      "Repro: relation on _id (resolves) vs relation on a non-_id key that is not @Select() (stays empty)",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(relAssignDataAPI, {
    caption: "Assignments — relation by _id vs by code",
    labelKey: "_id",
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
