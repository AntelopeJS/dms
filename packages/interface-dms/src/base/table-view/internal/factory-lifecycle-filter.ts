/** @internal */
import type { ComponentBuilder } from "../../../component";
import type { TableViewMeta } from "../meta";
import type { TableViewOptions, TableViewOptionsSerialized } from "../options";
import {
  adaptRowActions,
  resolveCustomButtons,
  resolveCustomRowActions,
  resolveTableViewGrants,
} from "./request-filter";
import { resolveTableViewTabs } from "./tabs";
import { resolveTableViewViews } from "./views";

type FilterArguments = Parameters<
  Parameters<ComponentBuilder<TableViewOptionsSerialized>["onFilter"]>[0]
>;

interface FilterDeclarations<T extends Record<string, unknown>> {
  declaredCustomButtons: TableViewOptions<T>["customButtons"];
  declaredCustomRowActions: NonNullable<
    TableViewOptions<T>["rowActions"]
  >["custom"];
  declaredTabs: TableViewOptions<T>["tabs"];
  declaredViews: TableViewOptions<T>["views"];
  meta: TableViewMeta;
  /** Whether the controller mounts a `new` route: without it nobody can add. */
  hasNewEndpoint: boolean;
}

/** @internal */
export async function filterTableViewOptions<T extends Record<string, unknown>>(
  declarations: FilterDeclarations<T>,
  request: FilterArguments,
): Promise<TableViewOptionsSerialized> {
  const {
    declaredCustomButtons,
    declaredCustomRowActions,
    declaredTabs,
    declaredViews,
    meta,
    hasNewEndpoint,
  } = declarations;
  const [permissions, options, permissionId, context] = request;
  const held = await resolveTableViewGrants(permissions, permissionId);
  const grants = { ...held, add: held.add && hasNewEndpoint };

  const adaptedFormComponents = {
    new: grants.add ? options.formComponents.new : undefined,
    edit: grants.edit ? options.formComponents.edit : undefined,
    view: grants.view ? options.formComponents.view : undefined,
  };

  const adaptedRowActions = adaptRowActions({
    rowActions: options.rowActions,
    archiveMode: options.archiveMode,
    grants,
    custom: await resolveCustomRowActions(
      permissions,
      declaredCustomRowActions,
      options.rowActions?.custom,
      permissionId,
    ),
    controllerRules: meta.controllerRowActionRules,
  });

  const adaptedCustomButtons = await resolveCustomButtons(
    permissions,
    declaredCustomButtons,
    options.customButtons,
    permissionId,
    context,
  );

  const adaptedTabs = await resolveTableViewTabs(
    permissions,
    declaredTabs,
    options.tabs,
    permissionId,
  );

  const adaptedViews = await resolveTableViewViews(
    permissions,
    declaredViews,
    options.views,
    permissionId,
  );

  return {
    ...options,
    enableTableExport: options.enableTableExport && grants.export,
    formComponents: adaptedFormComponents,
    rowActions: adaptedRowActions,
    customButtons: adaptedCustomButtons,
    tabs: adaptedTabs,
    views: adaptedViews,
  };
}
