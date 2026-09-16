import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { gateDemoInvoiceAPI } from "./data-api";

// Recovery-surface demo: suspend the tenant with
// POST /playground/gate-demo/toggle, then reload. This page stays reachable
// (page-level flag) and its first table keeps serving rows (controller-level
// flag), while the second table's routes stay gated and must surface an
// explicit error — never an empty table.
@RegisterPage()
export class PageTableViewGateBypass extends PageController(
  "table-view-gate-bypass",
  {
    displayName: "Gate Bypass",
    icon: "i-ph-lock-open",
    category: tableViewCategory,
    order: 130,
    description: "TableView kept readable while a tenant access gate denies",
    bypassTenantAccessGate: true,
  },
  DefaultLayout({ fullWidth: true }),
) {
  static invoices = TableView(gateDemoInvoiceAPI, {
    caption: "Invoices (bypasses the gate)",
    labelKey: "name",
    bypassTenantAccessGate: true,
  });

  static tasks = TableView(taskDataAPI, {
    caption: "Tasks (still gated)",
    labelKey: "name",
  });
}
