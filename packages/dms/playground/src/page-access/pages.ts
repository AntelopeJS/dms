import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Card,
  KeyValueList,
  type KeyValueListItem,
} from "@antelopejs/interface-dms/base";
import {
  EmptyLayout,
  FormPageLayout,
} from "@antelopejs/interface-dms/base/layouts";
import { memberAccessCategory, pageAccessCategory } from "./category";

const ROLES_TIP: KeyValueListItem = {
  label: "Check it",
  value: "Settings › Roles › Preview as role",
  type: "link",
  to: "/settings/workspace/roles",
};

function accessList(items: KeyValueListItem[]) {
  return KeyValueList({
    title: "What this page shows",
    items: [...items, ROLES_TIP],
  });
}

@RegisterPage()
export class PublicAccessPage extends PageController(
  "access-public",
  {
    displayName: "Public page",
    icon: "i-ph-globe",
    category: pageAccessCategory,
    order: 0,
    publicAccess: true,
    description:
      "Demonstrates: MenuOptions.publicAccess. Open this URL in a private window: it renders without signing in.",
  },
  FormPageLayout(),
) {
  static explain = accessList([
    {
      label: "publicAccess: true",
      value: "No auth decorator",
      detail:
        "Served to anonymous callers; its blocks must not need a session.",
    },
  ]);
}

@RegisterPage()
export class AuthOnlyAccessPage extends PageController(
  "access-auth-only",
  {
    displayName: "Any signed-in user",
    icon: "i-ph-sign-in",
    category: pageAccessCategory,
    order: 10,
    authOnly: true,
    description:
      "Demonstrates: MenuOptions.authOnly. Any signed-in user opens it, with no permission check and no entry in Roles.",
  },
  FormPageLayout(),
) {
  static explain = accessList([
    {
      label: "authOnly: true",
      value: "AuthUser",
      detail: "A session is enough: the page registers no permission.",
    },
  ]);
}

@RegisterPage()
export class CustomPermissionPage extends PageController(
  "access-custom-permission",
  {
    displayName: "Custom permission",
    icon: "i-ph-scroll",
    category: pageAccessCategory,
    order: 20,
    badge: "new",
    query: { scope: "audit" },
    permission: {
      title: "Read the audit trail",
      description: "Granted on its own in Settings › Roles",
      icon: "i-ph-scroll",
      dependencies: [`${pageAccessCategory.fullId}.access-auth-only`],
    },
    description:
      "Demonstrates: MenuOptions.permission (title, description, icon, dependencies), a static badge and a menu query. Find it in Settings › Roles.",
  },
  FormPageLayout(),
) {
  static explain = accessList([
    {
      label: "permission",
      value: "Read the audit trail",
      detail: "The title and description Roles shows for this page.",
    },
    {
      label: 'badge: "new"',
      value: "Static menu badge",
      detail: "Drawn at the end of the sidebar entry.",
    },
    {
      label: 'query: { scope: "audit" }',
      value: "?scope=audit",
      detail: "The sidebar link carries it: look at this page's URL.",
    },
  ]);
}

@RegisterPage()
export class MemberAccessPage extends PageController("access-members-page", {
  displayName: "Every member",
  icon: "i-ph-user-check",
  category: memberAccessCategory,
  order: 0,
  description:
    "Demonstrates: memberAccess and MenuOptions.layout on a category. Every member opens this page without a grant, and it inherits FormPageLayout from its category.",
}) {
  static explain = accessList([
    {
      label: "memberAccess: true",
      value: "defaultGranted",
      detail: "Set on the category; Roles does not list what is under it.",
    },
    {
      label: "layout: FormPageLayout()",
      value: "Inherited",
      detail:
        "This page declares no layout: the narrow column comes from its category.",
    },
  ]);
}

@RegisterPage()
export class NoComponentPermissionsPage extends PageController(
  "access-no-component-permissions",
  {
    displayName: "No block permissions",
    icon: "i-ph-stack-simple",
    category: pageAccessCategory,
    order: 40,
    noComponentPermissions: true,
    description:
      "Demonstrates: MenuOptions.noComponentPermissions. Roles lists this page alone, without one entry per block.",
  },
  FormPageLayout(),
) {
  static explain = accessList([
    {
      label: "noComponentPermissions: true",
      value: "Page grant only",
      detail: "Whoever opens the page sees every block.",
    },
  ]);

  static second = Card({
    title: "A second block",
    description: "It registers no permission of its own either.",
  });
}

@RegisterPage()
export class AllHiddenPage extends PageController(
  "access-all-hidden",
  {
    displayName: "Every block hidden",
    icon: "i-ph-eye-closed",
    category: pageAccessCategory,
    order: 50,
    description:
      "Demonstrates: PageLayout.allComponentsHidden. Grant a role this page but not its block, then Preview as role: the DMS says every block is hidden.",
  },
  FormPageLayout(),
) {
  static explain = accessList([
    {
      label: "Its only block",
      value: `${pageAccessCategory.fullId}.access-all-hidden.explain`,
      type: "mono",
      detail: "Leave it unticked in the role, keep the page ticked.",
    },
  ]);
}

@RegisterPage()
export class EmptyLayoutPage extends PageController(
  "access-empty-layout",
  {
    displayName: "Empty layout",
    icon: "i-ph-square",
    category: pageAccessCategory,
    order: 60,
    description:
      "Demonstrates: EmptyLayout(). The page draws without the dashboard frame's header.",
  },
  EmptyLayout(),
) {
  static explain = accessList([
    {
      label: "EmptyLayout()",
      value: "dms-empty-layout",
      type: "mono",
      detail: "No page header: its blocks are all there is.",
    },
  ]);
}
