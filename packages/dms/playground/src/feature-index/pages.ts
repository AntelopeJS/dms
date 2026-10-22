import { FEATURE_AREAS, type PlaygroundFeature } from "./types";

const AREA = FEATURE_AREAS.pages;

const HEADER = "/page-header/page-header-actions";
const HEADER_QUERY = `${HEADER}?workspace=web&locale=fr`;
const NAV = "/dynamic-nav";
const ACCESS = "/page-access";

/** Pages, categories and modules: how a page is declared and filed. */
const PAGE_FEATURES: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "A page declared as a class",
    api: "@RegisterPage() class extends PageController(id, options, layout)",
    demo: "/examples/overview",
  },
  {
    area: AREA,
    feature: "A sidebar root of the project's own",
    api: "RootCategory(id, options)",
    demo: "/examples/overview",
  },
  {
    area: AREA,
    feature: "Section headings left out of the URL",
    api: 'Category(id, { type: "label", urlSlug: "/" })',
    demo: "/page-header/page-header-actions",
  },
  {
    area: AREA,
    feature: "Categories nested four levels deep",
    api: "Category(id, { category })",
    demo: "/nested/level-2b/level-3b/nested-4b-1",
  },
  {
    area: AREA,
    feature: "Sibling pages whose slugs share a prefix",
    api: 'PageController("section") / PageController("section-archive")',
    demo: `${NAV}/section-archive`,
  },
  {
    area: AREA,
    feature: "A page slug with a route parameter",
    api: 'PageController(id, { urlSlug: "projects/:projectId" }) + {{params.X}}',
    demo: `${NAV}/overview`,
  },
  {
    area: AREA,
    feature: "A page kept out of the menu",
    api: "MenuOptions.hidden",
    demo: `${NAV}/project?project=invoicer`,
  },
  {
    area: AREA,
    feature: "A call-to-action menu entry",
    api: 'MenuOptions.variant: "accent"',
    demo: `${NAV}/new-project`,
  },
  {
    area: AREA,
    feature: "A static menu badge and a menu link query",
    api: "MenuOptions.badge / MenuOptions.query",
    demo: `${ACCESS}/access-custom-permission?scope=audit`,
  },
  {
    area: AREA,
    feature: "A project page among the workspace settings",
    api: "PageController(id, { category: workspaceSettingsCategory })",
    demo: "/settings/workspace/playground",
  },
  {
    area: AREA,
    feature: "A module with its catalog tile",
    api: "RegisterModule({ version, catalogCategory, status, readout })",
    demo: "/modules/demo/pages/welcome",
  },
  {
    area: AREA,
    feature: "Every module catalog state, one per load",
    api: 'ModuleInfo.status: "beta" | "update" | "attention"',
    demo: "/modules/plain/info",
  },
  {
    area: AREA,
    feature: "The page a module opens on",
    api: "ModuleInfo.landingPage",
    demo: "/modules/demo/pages/contact",
  },
  {
    area: AREA,
    feature: "A module's pages grouped under a named category",
    api: "ModuleInfo.defaultCategory",
    demo: "/modules/demo/pages/welcome",
  },
  {
    area: AREA,
    feature: "A module page under an in-module category",
    api: "Category(id, { module }) + PageController(id, { module, category })",
    demo: "/modules/demo/pages/tools/diagnostics",
  },
  {
    area: AREA,
    feature: "A module without a default category",
    api: "RegisterModule without defaultCategory",
    demo: "/modules/plain/info",
  },
];

/** The page header: buttons, availability and the page query. */
const HEADER_FEATURES: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "Header buttons of a page",
    api: "DefaultLayout({ headerActions })",
    demo: HEADER_QUERY,
  },
  {
    area: AREA,
    feature: "A header button disabled with a reason",
    api: "headerActions[].availability → { reason }",
    demo: `${HEADER}?workspace=archive&locale=en`,
    since: "v0.7.10",
  },
  {
    area: AREA,
    feature: "A header button hidden for the page query",
    api: "headerActions[].availability → { hidden: true }",
    demo: `${HEADER}?locale=de`,
    since: "v0.7.16",
  },
  {
    area: AREA,
    feature: "Header buttons ordered with a page's own actions",
    api: "headerActions[].order + usePageHeaderActions(render, { order })",
    demo: HEADER_QUERY,
    since: "v0.7.16",
  },
  {
    area: AREA,
    feature: "A header button label reading the page query",
    api: 'label: "$key" with "Download {locale}.json"',
    demo: HEADER_QUERY,
    since: "v0.7.18",
  },
  {
    area: AREA,
    feature: "Header button URLs following the page query",
    api: "target.url with {{query.X}}",
    demo: HEADER_QUERY,
    since: "v0.7.10",
  },
  {
    area: AREA,
    feature: "A download with the user's session",
    api: 'target: { type: "download", url, filename: "{{query.locale}}.json" }',
    demo: HEADER_QUERY,
    since: "v0.7.17",
  },
  {
    area: AREA,
    feature: "A link action keeping the page's context",
    api: 'target: { type: "page", url: "…?workspace={{query.workspace}}" }',
    demo: HEADER_QUERY,
    since: "v0.7.14",
  },
  {
    area: AREA,
    feature: "A header button gated by an action of the page",
    api: 'headerActions[].permission: "audit"',
    demo: HEADER_QUERY,
  },
  {
    area: AREA,
    feature: "A header button gated by a permission no page owns",
    api: "headerActions[].permissionId",
    demo: "/permissions",
  },
  {
    area: AREA,
    feature: "A header button running a quick action",
    api: 'target: { type: "quickAction", id }',
    demo: "/quick-actions",
  },
  {
    area: AREA,
    feature: "A table button drawn in the page header",
    api: 'customButtons[].placement: "header"',
    demo: "/quick-actions",
  },
];

/** Dynamic navigation and page validation. */
const NAVIGATION_FEATURES: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "Menu entries computed per request",
    api: "RegisterDynamicMenuProvider(categoryFullId, resolver)",
    demo: `${NAV}/overview`,
  },
  {
    area: AREA,
    feature: "Status dots and badges on dynamic entries",
    api: "DynamicMenuItem.status / badge",
    demo: `${NAV}/overview`,
  },
  {
    area: AREA,
    feature: "A live menu refresh",
    api: "NotifyMenuChanged(tenantId)",
    demo: `${NAV}/overview`,
  },
  {
    area: AREA,
    feature: "Dynamic entries filling a route parameter",
    api: "DynamicMenuItem.params",
    demo: `${NAV}/overview`,
  },
  {
    area: AREA,
    feature: "A dynamic entry listed only with a permission",
    api: "DynamicMenuItem.permissionId / variant / description",
    demo: `${NAV}/overview`,
  },
  {
    area: AREA,
    feature: "One page serving many entries by query",
    api: "validation.requiredQueryParams + DynamicMenuItem.query",
    demo: `${NAV}/project?project=invoicer`,
  },
  {
    area: AREA,
    feature: "A page validated by a frontend function",
    api: "validation.customFunctionId + useDefinedFunctions().registerFunction",
    demo: `${NAV}/project?project=resto-lucca`,
  },
  {
    area: AREA,
    feature: "A failed validation redirecting",
    api: 'validation.redirectTo: "/…?missing={{query.project}}"',
    demo: `${NAV}/project?project=archived-project`,
    since: "v0.7.14",
  },
];

/** Who may open a page, and extensions of pages owned by others. */
const ACCESS_FEATURES: PlaygroundFeature[] = [
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
const CHROME_FEATURES: PlaygroundFeature[] = [
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

/** Backend services a module calls. */
const SYSTEM_FEATURES: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "Notifications built and sent to yourself",
    api: "Notification().icon().title().description().linkTo().tone().toUser()",
    demo: "/notification/notification-test",
  },
  {
    area: AREA,
    feature: "A broadcast read once for everyone",
    api: 'broadcast({ readScope: "shared" })',
    demo: "/notification/notification-test",
  },
  {
    area: AREA,
    feature: "A notification delivered once per key",
    api: "toUser(id, { idempotencyKey })",
    demo: "/notification/notification-test",
    since: "v0.7.15",
  },
  {
    area: AREA,
    feature: "A notification text with params",
    api: "Notification().params({ count })",
    demo: "/notification/notification-test",
  },
  {
    area: AREA,
    feature: "A notification sent to roles",
    api: "toRoles(roleIds)",
    demo: "/notification/notification-test",
  },
  {
    area: AREA,
    feature: "A notification category and subject of the module's own",
    api: "NotificationCategory / NotificationSubject",
    demo: "/settings/user/notifications",
  },
  {
    area: AREA,
    feature: "A menu badge counted by a block",
    api: "component.navBadge({ count })",
    demo: "/notification/notification-test",
  },
  {
    area: AREA,
    feature: "Realtime messages with a payload and an actor",
    api: "PublishMessage(topic, type, { payload, actorId })",
    demo: "/realtime",
  },
  {
    area: AREA,
    feature: "A topic bound to a page by hand",
    api: "RegisterPageTopic(pageId, topic)",
    demo: "/realtime",
  },
  {
    area: AREA,
    feature: "A backend subscriber to a topic",
    api: "SubscribeMessage(topic, handler)",
    demo: "/realtime",
  },
  {
    area: AREA,
    feature: "A Vue component following a topic",
    api: "useRealtimeTopic(topic, handler)",
    demo: "/realtime",
  },
  {
    area: AREA,
    feature: "Hooks on invitations, members and users",
    api: "RegisterHook(Hook.INVITE_CREATED | MEMBER_ADDED | USER_REGISTERED …)",
    demo: "/hooks",
  },
  {
    area: AREA,
    feature: "A hook vetoing an invitation",
    api: "RegisterHook(Hook.INVITE_BEING_CREATED) throwing",
    demo: "/hooks",
  },
  {
    area: AREA,
    feature: "Fields of a module in the invite modal",
    api: "RegisterInviteExtension({ component, schema, onAccept, onUpdate, onCleanup })",
    demo: "/hooks",
  },
  {
    area: AREA,
    feature: "The invite button disabled with a reason",
    api: "RegisterInviteAvailability(resolver)",
    demo: "/hooks",
  },
  {
    area: AREA,
    feature: "A webhook reachable without a session",
    api: "AddFrontendModule({ publicEndpoints })",
    demo: "/hooks",
    since: "v0.7.15",
  },
  {
    area: AREA,
    feature: "A permission tied to no page",
    api: "RegisterPermission(id, permission)",
    demo: "/permissions",
  },
  {
    area: AREA,
    feature: "Effective permissions of a user",
    api: "GetEffectiveUserPermissions + HasPermission / HasAnyPermission",
    demo: "/permissions",
  },
  {
    area: AREA,
    feature: "Permissions reshaped per workspace",
    api: "RegisterPermissionsResolver({ id, order, resolver })",
    demo: "/permissions",
  },
  {
    area: AREA,
    feature: "The API and client base URLs",
    api: "GetApiBaseUrl() / GetClientBaseUrl()",
    demo: "/permissions",
    since: "v0.7.10",
  },
  {
    area: AREA,
    feature: "The client address of a request",
    api: "getClientIp(ctx)",
    demo: "/permissions",
    since: "v0.7.14",
  },
  {
    area: AREA,
    feature: "A workspace suspended by an access gate",
    api: "RegisterTenantAccessGate + CheckTenantAccess",
    demo: "/tenancy",
  },
  {
    area: AREA,
    feature: "Owner and member route guards",
    api: "AuthTenantOwner / AuthTenantMember({ bypassTenantAccessGate })",
    demo: "/tenancy",
  },
  {
    area: AREA,
    feature: "Tables kept readable while the gate refuses",
    api: "TableView({ bypassTenantAccessGate })",
    demo: "/table-view/table-view-gate-bypass",
  },
  {
    area: AREA,
    feature: "An email template of the module's own",
    api: "RegisterHtmlTemplate + GenerateHtml + dms.email.ts",
    demo: "/emails",
  },
  {
    area: AREA,
    feature: "The DMS email layout without heading divider",
    api: '<EmailLayout :divider="false" public-logo-only>',
    demo: "/emails",
    since: "v0.7.15",
  },
  {
    area: AREA,
    feature: "Every registered email template",
    api: "GetAllHtmlTemplates() / GetHtmlTemplate(name)",
    demo: "/emails",
  },
  {
    area: AREA,
    feature: "A form rewritten by the module owning its slot",
    api: "Form({ slotId }) + RegisterComponentSlot(slotId, resolver)",
    demo: "/page-extension#slotted",
  },
];

export const PAGES_FEATURES: PlaygroundFeature[] = [
  ...PAGE_FEATURES,
  ...HEADER_FEATURES,
  ...NAVIGATION_FEATURES,
  ...ACCESS_FEATURES,
  ...CHROME_FEATURES,
  ...SYSTEM_FEATURES,
];
