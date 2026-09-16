import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { cascaderCategoryDataAPI, cascaderProductDataAPI } from "./data-api";

@RegisterPage()
export class PageCascaderCategories extends PageController(
  "table-view-cascader-categories",
  {
    displayName: "Cascader · Categories",
    icon: "i-ph-tree-structure",
    category: tableViewCategory,
    order: 110,
    description: "Self-referencing category tree feeding the cascader",
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
    formContainer: { type: "drawer" },
  });
}

@RegisterPage()
export class PageCascaderProducts extends PageController(
  "table-view-cascader-products",
  {
    displayName: "Cascader · Products",
    icon: "i-ph-package",
    category: tableViewCategory,
    order: 120,
    description: "Products using the CascaderRelationType widget",
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
    formContainer: { type: "drawer" },
  });
}
