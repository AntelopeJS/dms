import type { PlaygroundFeature } from "./types";
import { AREA, ACCESS } from "./pages-demos";

/** Who may open a page, and extensions of pages owned by others. */
export const ACCESS_FEATURES: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "A page open to anonymous visitors",
    api: "MenuOptions.publicAccess",
    demo: `${ACCESS}/access-public`,
  },
  {
    area: AREA,
    feature: "A page for any signed-in user",
    api: "MenuOptions.authOnly",
    demo: `${ACCESS}/access-auth-only`,
  },
  {
    area: AREA,
    feature: "A page every member opens without a role",
    api: "MenuOptions.memberAccess",
    demo: `${ACCESS}/access-members/access-members-page`,
  },
  {
    area: AREA,
    feature: "A default layout inherited from the category",
    api: "Category(id, { layout: FormPageLayout() })",
    demo: `${ACCESS}/access-members/access-members-page`,
  },
  {
    area: AREA,
    feature: "A page permission with its own title and dependencies",
    api: "MenuOptions.permission: { title, description, icon, dependencies }",
    demo: `${ACCESS}/access-custom-permission`,
  },
  {
    area: AREA,
    feature: "A page without block permissions",
    api: "MenuOptions.noComponentPermissions",
    demo: `${ACCESS}/access-no-component-permissions`,
  },
  {
    area: AREA,
    feature: "A page only the platform owner opens",
    api: "MenuOptions.ownerOnly",
    demo: `${ACCESS}/access-owner-only`,
  },
  {
    area: AREA,
    feature: "A page whose every block is hidden",
    api: "PageLayout.allComponentsHidden",
    demo: `${ACCESS}/access-all-hidden`,
  },
  {
    area: AREA,
    feature: "A page without the dashboard frame",
    api: "EmptyLayout()",
    demo: `${ACCESS}/access-empty-layout`,
  },
  {
    area: AREA,
    feature: "A page reachable while the workspace is suspended",
    api: "MenuOptions.bypassTenantAccessGate",
    demo: "/tenancy",
  },
  {
    area: AREA,
    feature: "Blocks injected into another module's page",
    api: "@RegisterPageExtension(pageId) + .before() / .after()",
    demo: "/page-extension",
  },
  {
    area: AREA,
    feature: "Extensions ordered at one anchor",
    api: "component.order(n)",
    demo: "/page-extension",
  },
  {
    area: AREA,
    feature: "An extension anchored inside a stack",
    api: '.before("content.tasks")',
    demo: "/page-extension",
  },
  {
    area: AREA,
    feature: "Blocks injected into the DMS members pages",
    api: '@RegisterPageExtension("settings.workspace.members")',
    demo: "/settings/workspace/members",
  },
  {
    area: AREA,
    feature: "A route guarded by a nested block's permission",
    api: 'AuthUserWithPermission(Page.content.targetChild("tasks")) + GetPermissionId',
    demo: "/page-extension",
  },
  {
    area: AREA,
    feature: "A page setup function",
    api: "MenuOptions.setupId + PageSetupFunction",
    demo: "/form/form-simple",
  },
];

/** The dashboard around every page. */
export const CHROME_FEATURES: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "A text banner on the application's pages",
    api: "RegisterLayoutBanner({ text, actions, dismissible, visible })",
    demo: "/layout-banners",
  },
  {
    area: AREA,
    feature: "A banner built per request with composed text",
    api: "RegisterLayoutBanner({ resolve }) → { text: ComposedText }",
    demo: "/layout-banners",
    since: "v0.6.2",
  },
  {
    area: AREA,
    feature: "A banner mounting a Vue component",
    api: "RegisterLayoutBanner({ component, props })",
    demo: "/layout-banners",
  },
  {
    area: AREA,
    feature:
      "A banner kept out of, or following the user into, the module area",
    api: "RegisterLayoutBanner({ scope: LayoutBannerScope.EVERYWHERE })",
    demo: "/layout-banners",
  },
  {
    area: AREA,
    feature: "Quick actions in the command palette",
    api: "QuickActionCategory + QuickAction({ target })",
    demo: "/quick-actions",
  },
  {
    area: AREA,
    feature: "A quick action opening a page with a query",
    api: 'QuickAction target { type: "navigate", query }',
    demo: "/quick-actions",
  },
  {
    area: AREA,
    feature: "A quick action pressing a table button",
    api: 'QuickAction target { type: "button", button, component }',
    demo: "/quick-actions",
  },
  {
    area: AREA,
    feature: "A quick action dispatching a browser event",
    api: 'QuickAction target { type: "event", name, payload }',
    demo: "/quick-actions",
  },
  {
    area: AREA,
    feature: "Playground features in the command palette",
    api: "registerCommandPaletteSource({ id, order, groups })",
    demo: "/examples/features",
  },
];
