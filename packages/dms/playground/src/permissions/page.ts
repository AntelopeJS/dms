import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { KeyValueList } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { systemSection } from "../sections";
import { PERMISSIONS_DEMO_API } from "./api";
import { EXPORT_REPORTS_PERMISSION_ID } from "./registrations";

@RegisterPage()
export class PermissionsPage extends PageController(
  "permissions",
  {
    displayName: "Permissions",
    icon: "i-ph-shield-check",
    category: systemSection,
    order: 40,
    description:
      "Demonstrates: RegisterPermission, GetEffectiveUserPermissions, HasPermission and RegisterPermissionsResolver, plus the request helpers. Toggle the free plan, then Preview as role.",
  },
  DefaultLayout({
    headerActions: [
      {
        id: "export",
        label: "Export report",
        icon: "i-ph-export",
        permissionId: EXPORT_REPORTS_PERMISSION_ID,
        target: {
          type: "api",
          method: "POST",
          url: `${PERMISSIONS_DEMO_API}/export`,
          successMessage: "Report exported",
        },
      },
      {
        id: "free-plan",
        label: "Toggle the free plan",
        icon: "i-ph-tag",
        target: {
          type: "api",
          method: "POST",
          url: `${PERMISSIONS_DEMO_API}/free-plan/toggle`,
          successMessage: "Plan switched; the menu refreshes",
        },
      },
    ],
  }),
) {
  static me = KeyValueList({
    title: "Your effective permissions",
    fetchUrl: `${PERMISSIONS_DEMO_API}/me`,
  });

  static environment = KeyValueList({
    title: "Request context helpers",
    fetchUrl: `${PERMISSIONS_DEMO_API}/environment`,
  });

  static howTo = KeyValueList({
    title: "What to try",
    items: [
      {
        label: "Export report",
        value: `permissionId: "${EXPORT_REPORTS_PERMISSION_ID}"`,
        type: "mono",
        detail:
          "A header button gated by a permission no page owns; grant it in Settings › Roles.",
      },
      {
        label: "Toggle the free plan",
        value: "RegisterPermissionsResolver",
        detail:
          "Drops every charts permission a role grants in this workspace. An owner holds *, so Preview as role.",
      },
      {
        label: "Roles",
        value: "Open Settings › Roles",
        type: "link",
        to: "/settings/workspace/roles",
      },
    ],
  });
}
