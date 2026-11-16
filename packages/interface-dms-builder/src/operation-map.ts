import {
  AnalyseDatabase,
  GetAnalysis,
  GetLatestAnalysis,
  GetMapping,
} from "./analysis";
import { ComposePage } from "./compose";
import {
  CheckDatabaseConnection,
  GetDatabaseConnection,
  GetDatabaseProject,
  ListDatabaseConnections,
  ListEntryConnections,
  RemoveDatabaseConnection,
  RepairDatabaseConnections,
  SampleDatabaseRows,
  SetDatabaseConnectionUrl,
} from "./database";
import { PreviewLayout, PreviewQuery, SetPageBlocks } from "./drafts";
import { MapResources, PreviewMapResources } from "./mapping";
import {
  AddBlock,
  ConfigureBlock,
  ConfigureCategory,
  ConfigurePage,
  CreateCategory,
  CreatePage,
  DeleteCategory,
  DeletePage,
  GetCatalog,
  GetPageStructure,
  ListCategories,
  ListDataSources,
  ListPages,
  MoveBlock,
  RefreshSourceIndex,
  RemoveBlock,
} from "./operations";
import {
  AddModule,
  ConfigureModule,
  ConfigureProject,
  CreateLocalModule,
} from "./project";
import {
  AddQuery,
  ConfigureQuery,
  ListQueryTemplates,
  RemoveQuery,
} from "./queries";
import {
  AddField,
  ConfigureField,
  ConfigureResource,
  CreateResource,
  DeleteResource,
  GetResourceStructure,
  ListResources,
  RemoveField,
} from "./resources";
import { ConfigureTableView } from "./table-view";
import { CreateThemeLayer, GetTheme, SetTheme } from "./theme";

/**
 * Every operation of the builder, by the name it is exported under.
 *
 * A caller that picks an operation at run time, such as a route that forwards a
 * named request, indexes this map and keeps each operation's parameter and
 * result types, rather than reading the namespace import as an untyped record.
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
};

/** The name of one operation in `Operations`. */
export type OperationName = keyof typeof Operations;
