import { Category } from "@antelopejs/interface-dms/page";
import { libraryCategory } from "../sections";

export const tableViewCategory = Category("table-view", {
  displayName: "Table View",
  icon: "i-ph-table",
  order: 30,
  category: libraryCategory,
});
