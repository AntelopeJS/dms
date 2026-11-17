import type { PlaygroundFeature } from "./types";
import { AREA, HEADER, HEADER_QUERY, NAV, ACCESS } from "./pages-demos";

/** Pages, categories and modules: how a page is declared and filed. */
export const PAGE_FEATURES: PlaygroundFeature[] = [
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
export const HEADER_FEATURES: PlaygroundFeature[] = [
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
export const NAVIGATION_FEATURES: PlaygroundFeature[] = [
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
