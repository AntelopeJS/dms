/**
 * The builder interface implementation. Every operation reaches the template
 * registry (compiling a query, or recognizing one already written), so the
 * built-in query templates are registered as this module loads.
 */
import type {
  Operations as BuilderOperations,
  AddBlockInput,
  AnalyseDatabaseInput,
  AnalysisState,
  MappedRelation,
  MapResourcesInput,
  MapResourcesPreview,
  MapResourcesResult,
  ModuleEntryInput,
  ConfigureProjectOpts,
  CreateLocalModuleOpts,
  ProjectConfigOpts,
  ProjectConfigResult,
  ProjectConfigStep,
  AddQueryInput,
  BlockCatalog,
  ComposePageData,
  ComposePageInput,
  BlockPath,
  CategoryRef,
  CategorySummary,
  ConfigureBlock as ConfigureBlockContract,
  ConfigureBlockOpts,
  ConfigureTableViewOpts,
  TableViewSettings,
  CreateCategoryInput,
  CreatePageInput,
  CreateResourceInput,
  DataSourceDescriptor,
  DeleteResourceOpts,
  EditableCategoryMeta,
  EditablePageMeta,
  EditableResourceMeta,
  FieldAspects,
  FieldPath,
  FieldSpec,
  MoveDest,
  MutationOpts,
  OpResult,
  PageDraft,
  PageLayoutPreview,
  PageRef,
  PageStructure,
  PageSummary,
  QueryPreview,
  QueryPreviewRequest,
  QueryRef,
  QueryTemplateDescriptor,
  RefreshScope,
  ResourceFiles,
  ResourceRef,
  ResourceStructure,
  ResourceSummary,
  ThemeDraft,
  ThemeLayer,
  ThemeStructure,
} from "@antelopejs/interface-dms-builder";
import { analysisState, startAnalysis } from "./engine/analysis-job";
import { withConnectionAccess } from "./engine/connection-access-config";
import { mapResources, previewMapResources } from "./engine/map-resources";
import { mappedChoices } from "./engine/mapped-choices";
import { configureProject } from "./engine/project-config-ops";
import { configureProjectWithVariables } from "./engine/project-env";
import {
  CheckDatabaseConnection,
  GetDatabaseConnection,
  GetDatabaseProject,
  GetLatestAnalysis,
  ListDatabaseConnections,
  ListEntryConnections,
  RemoveDatabaseConnection,
  RepairDatabaseConnections,
  SampleDatabaseRows,
  SetDatabaseConnectionUrl,
} from "./database";

export * from "./database";
import {
  buildCatalog,
  invalidateCatalog,
  listDeclaredDataSources,
} from "./engine/catalog";
import { composePage } from "./engine/compose-page";
import { addBlock, configureBlock } from "./engine/ops";
import {
  configureCategory,
  createCategory,
  deleteCategory,
} from "./engine/ops-categories";
import {
  configurePage,
  createPage,
  moveBlock,
  removeBlock,
} from "./engine/ops-blocks";
import { deletePage } from "./engine/page-delete";
import { configureTableView } from "./engine/table-view-settings";
import { setPageBlocks } from "./engine/page-draft";
import { buildPageStructure } from "./engine/page-structure";
import { previewLayout } from "./engine/preview";
import { runQueryPreview } from "./engine/query-preview";
import { addQuery, configureQuery, removeQuery } from "./engine/query-ops-emit";
import { listQueryTemplates } from "./engine/query-template";
import { registerBuiltinQueryTemplates } from "./engine/query-template-emit";
import { listResourceSummaries } from "./engine/resource-index";
import { createResource } from "./engine/resource-ops";
import {
  addField,
  configureField,
  configureResource,
  deleteResource,
  removeField,
} from "./engine/resource-ops-delete";
import { buildResourceStructure } from "./engine/resource-structure";
import { getTheme, setTheme } from "./engine/theme";
import { createThemeLayer } from "./engine/theme-scaffold";
import {
  invalidateSourceIndex,
  listCategorySummaries,
  listPageSummaries,
} from "./engine/source-index";

registerBuiltinQueryTemplates();

export async function ListPages(): Promise<PageSummary[]> {
  return listPageSummaries();
}

export async function ListCategories(): Promise<CategorySummary[]> {
  return listCategorySummaries();
}

export async function GetCatalog(): Promise<BlockCatalog> {
  return buildCatalog();
}

export async function ListDataSources(
  response?: string,
): Promise<DataSourceDescriptor[]> {
  return listDeclaredDataSources(response);
}

export async function GetPageStructure(
  ref: PageRef,
): Promise<OpResult<PageStructure>> {
  return buildPageStructure(ref);
}

export async function SetPageBlocks(
  page: PageRef,
  draft: PageDraft,
  opts?: MutationOpts,
): Promise<OpResult<{ version: string }>> {
  return withConnectionAccess(() => setPageBlocks(page, draft, opts));
}

export async function PreviewQuery(
  request: QueryPreviewRequest,
): Promise<OpResult<QueryPreview>> {
  return runQueryPreview(request);
}

export async function PreviewLayout(
  page: PageRef,
  draft: PageDraft,
): Promise<OpResult<PageLayoutPreview>> {
  return previewLayout(page, draft);
}

export async function RefreshSourceIndex(scope?: RefreshScope): Promise<void> {
  invalidateSourceIndex();
  if (!scope?.page) {
    invalidateCatalog();
  }
}

export async function CreatePage(
  input: CreatePageInput,
): Promise<OpResult<{ ref: PageRef; filepath: string }>> {
  return createPage(input);
}

export async function ConfigurePage(
  ref: PageRef,
  patch: Partial<EditablePageMeta>,
  opts?: MutationOpts,
): Promise<OpResult<{ ref: PageRef; version: string }>> {
  return configurePage(ref, patch, opts);
}

export async function DeletePage(
  ref: PageRef,
  opts?: MutationOpts,
): Promise<OpResult> {
  return deletePage(ref, opts);
}

export async function CreateCategory(
  input: CreateCategoryInput,
): Promise<OpResult<{ ref: CategoryRef }>> {
  return createCategory(input);
}

export async function ConfigureCategory(
  ref: CategoryRef,
  patch: Partial<EditableCategoryMeta>,
): Promise<OpResult> {
  return configureCategory(ref, patch);
}

export async function DeleteCategory(ref: CategoryRef): Promise<OpResult> {
  return deleteCategory(ref);
}

export async function AddBlock(
  input: AddBlockInput,
  opts?: MutationOpts,
): Promise<OpResult<{ path: BlockPath }>> {
  return withConnectionAccess(() => addBlock(input, opts));
}

export async function ConfigureBlock(
  path: BlockPath,
  patch: Parameters<typeof ConfigureBlockContract>[1],
  opts?: ConfigureBlockOpts,
): Promise<OpResult> {
  return withConnectionAccess(() => configureBlock(path, patch, opts));
}

export async function MoveBlock(
  path: BlockPath,
  dest: MoveDest,
  opts?: MutationOpts,
): Promise<OpResult> {
  return moveBlock(path, dest, opts);
}

export async function RemoveBlock(
  path: BlockPath,
  opts?: MutationOpts,
): Promise<OpResult> {
  return removeBlock(path, opts);
}

export async function MapResources(
  input: MapResourcesInput,
): Promise<OpResult<MapResourcesResult>> {
  return withConnectionAccess(() => mapResources(input));
}

export async function PreviewMapResources(
  input: MapResourcesInput,
): Promise<OpResult<MapResourcesPreview>> {
  return withConnectionAccess(() => previewMapResources(input));
}

export async function AnalyseDatabase(
  input: AnalyseDatabaseInput,
): Promise<OpResult<AnalysisState>> {
  return startAnalysis(input);
}

export async function GetAnalysis(
  id: string,
): Promise<OpResult<AnalysisState>> {
  return analysisState(id);
}

export async function GetMapping(
  connection: string,
  module: string,
): Promise<OpResult<MappedRelation[]>> {
  return mappedChoices(connection, module);
}

/**
 * Applies configuration steps to `antelope.config.ts`.
 *
 * The owner path for a connection's access: owner-authenticated routes grant `read-write` through
 * it, dms-database's `PUT /api/database/connections/<id>/access` and dms-assistant's
 * `POST /database/project`. Agents reach it only through the MCP tool `builder_configure_project`,
 * which refuses a step that raises an access before it calls this.
 */
export async function ConfigureProject(
  steps: ProjectConfigStep[],
  opts: ConfigureProjectOpts = {},
): Promise<OpResult<ProjectConfigResult>> {
  const { variables, ...configOpts } = opts;
  if (!variables?.length || configOpts.dryRun) {
    return configureProject(steps, configOpts);
  }
  return configureProjectWithVariables(steps, variables);
}

/**
 * Adds a module entry to `antelope.config.ts`.
 *
 * The owner path for a connection's access: owner-authenticated routes grant `read-write` through
 * it, dms-database's `PUT /api/database/connections/<id>/access` and dms-assistant's
 * `POST /database/project`. Agents reach it only through the MCP tool `builder_configure_project`,
 * which refuses a step that raises an access before it calls this.
 */
export async function AddModule(
  id: string,
  entry: ModuleEntryInput,
  opts?: ProjectConfigOpts,
): Promise<OpResult<ProjectConfigResult>> {
  return configureProject([{ op: "AddModule", id, entry }], opts);
}

/**
 * Merges into a module entry of `antelope.config.ts`.
 *
 * The owner path for a connection's access: owner-authenticated routes grant `read-write` through
 * it, dms-database's `PUT /api/database/connections/<id>/access` and dms-assistant's
 * `POST /database/project`. Agents reach it only through the MCP tool `builder_configure_project`,
 * which refuses a step that raises an access before it calls this.
 */
export async function ConfigureModule(
  id: string,
  entry: ModuleEntryInput,
  opts?: ProjectConfigOpts,
): Promise<OpResult<ProjectConfigResult>> {
  return configureProject([{ op: "ConfigureModule", id, entry }], opts);
}

/**
 * Scaffolds a local module and adds its entry to `antelope.config.ts`.
 *
 * The owner path for a connection's access: owner-authenticated routes grant `read-write` through
 * it, dms-database's `PUT /api/database/connections/<id>/access` and dms-assistant's
 * `POST /database/project`. Agents reach it only through the MCP tool `builder_configure_project`,
 * which refuses a step that raises an access before it calls this.
 */
export async function CreateLocalModule(
  id: string,
  path: string,
  entry?: ModuleEntryInput,
  opts: CreateLocalModuleOpts = {},
): Promise<OpResult<ProjectConfigResult>> {
  const { connection, ...configOpts } = opts;
  return configureProject(
    [{ op: "CreateLocalModule", id, path, entry, connection }],
    configOpts,
  );
}

export async function CreateResource(
  input: CreateResourceInput,
): Promise<OpResult<{ ref: ResourceRef; files: ResourceFiles }>> {
  return createResource(input);
}

export async function ConfigureTableView(
  page: PageRef,
  settings: TableViewSettings,
  opts?: ConfigureTableViewOpts,
): Promise<OpResult<{ path: BlockPath }>> {
  return configureTableView(page, settings, opts);
}

export async function ConfigureResource(
  ref: ResourceRef,
  patch: EditableResourceMeta,
  opts?: MutationOpts,
): Promise<OpResult> {
  return withConnectionAccess(() => configureResource(ref, patch, opts));
}

export async function DeleteResource(
  ref: ResourceRef,
  opts?: DeleteResourceOpts,
): Promise<OpResult> {
  return deleteResource(ref, opts);
}

export async function AddField(
  ref: ResourceRef,
  field: FieldSpec,
  opts?: MutationOpts,
): Promise<OpResult<{ path: FieldPath }>> {
  return addField(ref, field, opts);
}

export async function ConfigureField(
  path: FieldPath,
  patch: Partial<FieldAspects>,
  opts?: MutationOpts,
): Promise<OpResult> {
  return configureField(path, patch, opts);
}

export async function RemoveField(
  path: FieldPath,
  opts?: MutationOpts,
): Promise<OpResult> {
  return removeField(path, opts);
}

export async function ListResources(): Promise<ResourceSummary[]> {
  return listResourceSummaries();
}

export async function GetResourceStructure(
  ref: ResourceRef,
): Promise<OpResult<ResourceStructure>> {
  return buildResourceStructure(ref);
}

export async function ListQueryTemplates(
  resourceType?: string,
): Promise<QueryTemplateDescriptor[]> {
  return listQueryTemplates(resourceType);
}

export async function AddQuery(
  page: PageRef,
  input: AddQueryInput,
  opts?: MutationOpts,
): Promise<OpResult<{ query: QueryRef; route: string }>> {
  return addQuery(page, input, opts);
}

export async function RemoveQuery(
  query: QueryRef,
  opts?: MutationOpts,
): Promise<OpResult> {
  return removeQuery(query, opts);
}

export async function ConfigureQuery(
  query: QueryRef,
  patch: Partial<AddQueryInput>,
  opts?: MutationOpts,
): Promise<OpResult> {
  return configureQuery(query, patch, opts);
}

export async function ComposePage(
  input: ComposePageInput,
  opts?: MutationOpts,
): Promise<OpResult<ComposePageData>> {
  return withConnectionAccess(() => composePage(input, opts));
}

export async function GetTheme(): Promise<OpResult<ThemeStructure>> {
  return getTheme();
}

export async function SetTheme(
  draft: ThemeDraft,
  opts?: MutationOpts,
): Promise<OpResult<{ version: string }>> {
  return setTheme(draft, opts);
}

export async function CreateThemeLayer(): Promise<OpResult<ThemeLayer>> {
  return createThemeLayer();
}

/**
 * The map the interface declares next to its flat exports. The core attaches an implementation to every
 * path of the declaration, so each operation is answered here as well, by the same function.
 */
export const Operations = {
  AddBlock,
  AddField,
  AddModule,
  AddQuery,
  AnalyseDatabase,
  CheckDatabaseConnection,
  ComposePage,
  ConfigureBlock,
  ConfigureCategory,
  ConfigureField,
  ConfigureModule,
  ConfigurePage,
  ConfigureProject,
  ConfigureQuery,
  ConfigureResource,
  ConfigureTableView,
  CreateCategory,
  CreateLocalModule,
  CreatePage,
  CreateResource,
  CreateThemeLayer,
  DeleteCategory,
  DeletePage,
  DeleteResource,
  GetAnalysis,
  GetCatalog,
  GetDatabaseConnection,
  GetDatabaseProject,
  GetLatestAnalysis,
  GetMapping,
  GetPageStructure,
  GetResourceStructure,
  GetTheme,
  ListCategories,
  ListDatabaseConnections,
  ListDataSources,
  ListEntryConnections,
  ListPages,
  ListQueryTemplates,
  ListResources,
  MapResources,
  PreviewMapResources,
  MoveBlock,
  PreviewLayout,
  PreviewQuery,
  RefreshSourceIndex,
  RemoveBlock,
  RemoveDatabaseConnection,
  RemoveField,
  RemoveQuery,
  RepairDatabaseConnections,
  SampleDatabaseRows,
  SetDatabaseConnectionUrl,
  SetPageBlocks,
  SetTheme,
} satisfies typeof BuilderOperations;
