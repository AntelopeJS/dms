import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { ModelReference } from "@antelopejs/interface-data-api/metadata";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { ORDER_STATUSES, orderDataAPI } from "./data-api";
import { Order, OrderModel } from "./database";
import { demoFormTexts } from "../form-texts";

const DETAIL_FIELDS = [
  { key: "shippingAddress", label: "Ship to" },
  "carrier",
  "payment",
  "email",
];

const statusTabs = ORDER_STATUSES.map((status) => ({
  id: status.value,
  label: status.label,
  filters: [{ accessorKey: "status", value: status.value, mode: "is" }],
}));

@RegisterDataController()
class componentOrderDataAPI extends DataController(
  Order,
  {},
  Controller("/api/playground/orders-component", orderDataAPI),
) {
  @ModelReference()
  declare model: OrderModel;
}

@RegisterPage()
export class PageTableViewExpandableRows extends PageController(
  "table-view-expandable-rows",
  {
    displayName: "Expandable rows",
    icon: "i-ph-caret-circle-down",
    category: tableViewCategory,
    order: 34,
    description:
      'The expandable option of TableView: a caret column opens a detail band under each order. The first table lists detail fields (defaultExpanded "first", next to row selection and row actions); the second hands the whole band to the OrderLinesDetail component, one row at a time, under status tabs, compact density and a 560px scroll area',
  },
  DefaultLayout({ fullWidth: true }),
) {
  static fields = TableView(orderDataAPI, {
    caption: "Orders · detail fields",
    labelKey: "number",
    formTexts: demoFormTexts("order"),
    defaultSort: { field: "placedAt", desc: true },
    expandable: {
      fields: DETAIL_FIELDS,
      fieldsLabel: "Shipping & payment",
      defaultExpanded: "first",
    },
    rowActions: {
      add: true,
      edit: { isVisible: true },
      delete: true,
      duplicate: true,
      hasSelection: true,
    },
  });

  static component = TableView(componentOrderDataAPI, {
    caption: "Orders · detail component, one row at a time",
    labelKey: "number",
    formTexts: demoFormTexts("order"),
    density: "compact",
    maxHeight: "560px",
    defaultSort: { field: "placedAt", desc: true },
    tabs: statusTabs,
    expandable: {
      component: CustomComponent("OrderLinesDetail"),
      single: true,
    },
    rowActions: {
      edit: true,
      delete: true,
      hasSelection: true,
    },
  });
}
