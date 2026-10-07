/**
 * Public entry of the page system, split by concern under `./page/`:
 *
 * - `types` — the shared vocabulary (menu options, page/category infos,
 *   dynamic menu and extension contracts)
 * - `registry` — the page layout and permission id lookups
 * - `layout-filter` — permission filtering of a serialized layout
 * - `categories` — the `internal` registration proxies and the module
 *   membership check
 * - `metadata` — `PageMetadata`, the registration/teardown lifecycle of one
 *   page
 * - `controllers` — the consumer-facing decorators and constructors
 * - `roots` — the built-in root categories and module registration
 *
 * The plumbing behind them lives under `./page/internal/` and is not
 * re-exported here: the module-wide registries every piece writes to
 * (`registry`), category resolution and creation (`categories`), the
 * deterministic ordering and grafting of page extensions into a layout
 * (`extension-assembly`), extension validation, component targets and trees,
 * form page route claims and the registration identities.
 */
export { internal, isInsideModule } from "./page/categories";
export {
  AddFrontendModule,
  type AddFrontendModuleOptions,
  Category,
  type FrontendModuleMetadata,
  type FrontendModuleOptions,
  type FrontendModuleValue,
  type FrontendRendererMetadata,
  GetFrontendModules,
  NotifyMenuChanged,
  PageController,
  RegisterDynamicMenuProvider,
  RegisterPage,
  RegisterPageExtension,
  RootCategory,
  RootPageController,
} from "./page/controllers";
export { PageDeclarationConflictError } from "./page/declaration-conflict";
export { FormPageRouteConflictError } from "./page/form-page-routes";
export { PageMetadata } from "./page/metadata";
export {
  ClearPageLayoutBySlug,
  GetComponentPermissionIds,
  GetPageLayoutBySlug,
  GetPermissionId,
  GetRegisteredPageIds,
} from "./page/registry";
export * from "./page/roots";
export * from "./page/types";
