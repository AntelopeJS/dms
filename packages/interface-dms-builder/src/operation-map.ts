import { AnalyseDatabase, GetAnalysis, GetMapping } from "./analysis";
import { ComposePage } from "./compose";
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
  DeleteCategory,
  DeletePage,
  DeleteResource,
  GetAnalysis,
  GetCatalog,
  GetMapping,
  GetPageStructure,
  GetResourceStructure,
  ListCategories,
  ListDataSources,
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
  RemoveField,
  RemoveQuery,
  SetPageBlocks,
};

/** The name of one operation in `Operations`. */
export type OperationName = keyof typeof Operations;
