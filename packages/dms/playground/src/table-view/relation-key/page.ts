import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { relAssignDataAPI } from "./data-api";
import { demoFormPages } from "../form-texts";

@RegisterPage()
export class PageTableViewRelationKey extends PageController(
  "table-view-relation-key",
  {
    displayName: "Relation · Key",
    icon: "i-ph-link",
    category: tableViewCategory,
    order: 120,
    description:
      "Relations resolved on _id and on another key: Dept (by code) and Member (by userId) find their row through RelationType({ index }), which needs that key @Select() on the target.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(relAssignDataAPI, {
    caption: "Assignments — relation by _id vs by code",
    labelKey: "_id",
    formContainer: { type: "page", pages: demoFormPages("assignment") },
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
