import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { demoGuide } from "../guide";
import { inlineProductDataAPI, inlineProductInputsDataAPI } from "./data-api";

@RegisterPage()
export class PageTableViewInlineEdit extends PageController(
  "table-view-inline-edit",
  {
    displayName: "Inline edit",
    icon: "i-ph-pencil-simple-line",
    category: tableViewCategory,
    order: 106,
    description:
      "A product catalogue edited in the grid, twice: first its values framed as inputs when hovered, a click opening the input; then every editable cell drawn as its input. Each change is saved at once. Notes stay in the edit form.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Hover, then click a price or a name",
      text: 'inlineEdit: true (inputs: "hover", the default). A hovered cell is framed as its input; a click turns it into that input; Enter or clicking away saves at once (one PUT /edit with that field alone), Esc cancels. An unchanged value sends nothing.',
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
      label: "Empty a name, press Enter",
      text: "The server refuses it (the name is mandatory): the cell stays open on what you typed, marked invalid, and a toast says why. Click another cell instead and the refused one stays marked until you edit it again.",
    },
    {
      label: "SKU and Notes",
      text: "A read-only column and a long text (a textarea) keep their display: edit Notes from the row's drawer (double-click the row outside an editable cell, the default rowClick: a click is the cell's).",
    },
    {
      label: "Grouped display",
      text: 'grouped: { groupByField: "category" }: the same cells are edited under the group headers. The edit grant decides it all: without it the table is read-only.',
    },
    {
      label: "Second table: type straight into a cell",
      text: 'inlineEdit: { inputs: "always" }: every editable cell is drawn as its input, nothing to open. Type into a price, Tab to the next one: the cell left is saved (one PUT /edit per changed value). Enter saves and keeps the keyboard there, Esc puts the value back. A select opens on a click, the pick is the save. rowClick: "none": neither click opens the row, its Edit action does.',
    },
  ]);

  static products = TableView(inlineProductDataAPI, {
    caption: "Products",
    labelKey: "name",
    inlineEdit: true,
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

  static productInputs = TableView(inlineProductInputsDataAPI, {
    caption: "Products, inputs at rest",
    labelKey: "name",
    inlineEdit: { inputs: "always" },
    rowClick: "none",
    formContainer: { type: "drawer" },
    defaultSort: { field: "name" },
    rowActions: {
      add: true,
      edit: true,
      delete: true,
    },
  });
}
