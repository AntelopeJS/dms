import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { cascaderCategoryDataAPI, cascaderProductDataAPI } from "./data-api";
import { demoFormPages } from "../form-texts";

@RegisterPage()
export class PageCascaderCategories extends PageController(
  "table-view-cascader-categories",
  {
    displayName: "Cascader · Categories",
    icon: "i-ph-tree-structure",
    category: tableViewCategory,
    order: 130,
    description:
      "A self-referencing category tree, the data the Cascader Products picker reads. Add a sub-category under a category.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(cascaderCategoryDataAPI, {
    caption: "Product categories (self-referencing tree)",
    labelKey: "name",
    rowActions: {
      add: true,
      delete: true,
      edit: true,
      details: true,
      hasSelection: true,
    },
    formContainer: { type: "drawer", pages: demoFormPages("category") },
  });
}

@RegisterPage()
export class PageCascaderProducts extends PageController(
  "table-view-cascader-products",
  {
    displayName: "Cascader · Products",
    icon: "i-ph-package",
    category: tableViewCategory,
    order: 131,
    description:
      "Products picking their category with a CascaderRelationType. Add a product and walk the category tree.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(cascaderProductDataAPI, {
    caption: "Products (CascaderRelationType single + multiple/leafOnly)",
    labelKey: "name",
    rowActions: {
      add: true,
      delete: true,
      edit: true,
      details: true,
      hasSelection: true,
    },
    formContainer: { type: "drawer", pages: demoFormPages("product") },
  });
}
