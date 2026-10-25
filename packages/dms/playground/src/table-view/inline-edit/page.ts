import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { demoGuide } from "../guide";
import { inlineProductDataAPI } from "./data-api";

@RegisterPage()
export class PageTableViewInlineEdit extends PageController(
  "table-view-inline-edit",
  {
    displayName: "Inline edit",
    icon: "i-ph-pencil-simple-line",
    category: tableViewCategory,
    order: 106,
    description:
      "A product catalogue edited in the grid: a click turns a cell into its input, and each change is saved at once. Notes stay in the edit form.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Click a price or a name",
      text: "inlineEdit: true. The cell turns into its input; Enter or clicking away saves at once (one PUT /edit with that field alone), Esc cancels. An unchanged value sends nothing.",
    },
    {
      label: "Toggle Active",
      text: "A switch saves as it toggles, without opening the cell. Turning a product inactive locks its Stock: the column's disabledWhen is read on the row.",
    },
    {
      label: "Pick a category or a launch date",
      text: "A select or a date picker opens with the cell, and the pick is the save.",
    },
    {
      label: "Empty the name, or type a negative price",
      text: "The server refuses it: the cell stays open on what you typed, marked invalid, and a toast says why.",
    },
    {
      label: "SKU and Notes",
      text: "A read-only column and a rich text keep their display: edit Notes from the row's drawer (click the row outside an editable cell).",
    },
    {
      label: "Grouped display",
      text: 'grouped: { groupByField: "category" }: the same cells are edited under the group headers. The edit grant decides it all: without it the table is read-only.',
    },
  ]);

  static products = TableView(inlineProductDataAPI, {
    caption: "Products",
    labelKey: "name",
    inlineEdit: true,
    rowClick: "single",
    formContainer: { type: "drawer" },
    defaultSort: { field: "name" },
    grouped: { groupByField: "category" },
    rowActions: {
      add: true,
      edit: true,
      delete: true,
      hasSelection: true,
    },
  });
}
