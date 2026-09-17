/**
 * Public entry of the page system, split by concern under `./page/`:
 *
 * - `types` — the shared vocabulary (menu options, page/category infos,
 *   dynamic menu and extension contracts)
 * - `registry` — the module-wide registries every other piece writes to
 * - `layout-filter` — permission filtering of a serialized layout
 * - `extension-assembly` — deterministic ordering and grafting of page
 *   extensions into a layout
 * - `categories` — category resolution and creation, and the `internal`
 *   registration proxies
 * - `metadata` — `PageMetadata`, the registration/teardown lifecycle of one
 *   page
 * - `controllers` — the consumer-facing decorators and constructors
 * - `roots` — the built-in root categories and module registration
 *
 * The barrel re-exports the exact surface the former single-file module
 * exposed; the pieces also export their cross-file internals, which are not
 * part of the public interface.
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
export { PageMetadata } from "./page/metadata";
export {
  ClearPageLayoutBySlug,
  GetComponentPermissionIds,
  GetPageLayoutBySlug,
  GetPendingPageExtensions,
  GetPermissionId,
  GetRegisteredPageIds,
  type PendingPageExtension,
} from "./page/registry";
export * from "./page/roots";
export * from "./page/types";
