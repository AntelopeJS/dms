import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { KeyValueList } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { systemSection } from "../sections";
import { GATE_DEMO_API } from "../table-view/gate-bypass/gate";

const GATE_BYPASS_PAGE_URL = "/table-view/table-view-gate-bypass";

@RegisterPage()
export class TenancyPage extends PageController(
  "tenancy",
  {
    displayName: "Tenancy",
    icon: "i-ph-buildings",
    category: systemSection,
    order: 50,
    description:
      "Demonstrates: RegisterTenantAccessGate, CheckTenantAccess and the tenant guards. Suspend the workspace from the header, then browse: most pages refuse you until you restore it here.",
    bypassTenantAccessGate: true,
  },
  DefaultLayout({
    headerActions: [
      {
        id: "toggle-gate",
        label: "Suspend / restore the workspace",
        icon: "i-ph-lock",
        color: "primary",
        target: {
          type: "api",
          method: "POST",
          url: `${GATE_DEMO_API}/toggle`,
          successMessage: "Gate toggled",
        },
      },
    ],
  }),
) {
  static status = KeyValueList({
    title: "Tenant access, for you",
    fetchUrl: `${GATE_DEMO_API}/status`,
  });

  static pieces = KeyValueList({
    title: "What takes part",
    items: [
      {
        label: "RegisterTenantAccessGate",
        value: "playground-gate-demo",
        type: "mono",
        detail: "Refuses a suspended workspace with a code of its own.",
      },
      {
        label: "AuthTenantOwner({ bypassTenantAccessGate })",
        value: "POST …/gate-demo/toggle",
        type: "mono",
        detail:
          "Only the owner may press it, and it still answers while suspended.",
      },
      {
        label: "AuthTenantMember + CheckTenantAccess",
        value: "GET …/gate-demo/status",
        type: "mono",
        detail:
          "The block above, which reads the gate's answer without failing on it.",
      },
      {
        label: "MenuOptions.bypassTenantAccessGate",
        value: "This page, and Gate Bypass",
        detail: "Recovery surfaces stay reachable while the gate refuses.",
      },
      {
        label: "Recovery table views",
        value: "Open Gate Bypass",
        type: "link",
        to: GATE_BYPASS_PAGE_URL,
        detail:
          "One table bypasses the gate, the other answers an explicit error.",
      },
      {
        label: "Component layout banner",
        value: "isTenantAccessDenied",
        detail:
          "A banner shows on every page while the workspace is suspended.",
      },
    ],
  });
}
