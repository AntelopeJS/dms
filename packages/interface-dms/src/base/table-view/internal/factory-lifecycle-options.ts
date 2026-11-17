/** @internal */
import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import type { FormBuilder } from "../../form-types";
import { hasSearchableFields } from "../../internal/searchable";
import type { TableViewMeta } from "../meta";
import type { TableViewOptions, TableViewOptionsSerialized } from "../options";
import {
  type FormPageKind,
  serializeCustomButtons,
  serializeExpandable,
  serializeRowActions,
  serializeTableViewDisplays,
} from "./factory-helpers";
import { eraseRowType } from "./erase-row-type";
import { serializeTableViewTabs } from "./tabs";
import { serializeTableViewViews } from "./views";
import { serializeEmptyStates, serializeFooter } from "./footer";
import { readColumnValuesInForm, tableViewColumnValues } from "./column-values";

interface SerializationState<T extends ControllerClass> {
  controller: T;
  options: TableViewOptions<InstanceType<T>>;
  meta: TableViewMeta;
  config: TableViewMeta["config"];
  forms: Record<FormPageKind, FormBuilder | undefined>;
  serializedRowActions: TableViewOptionsSerialized["rowActions"];
  serializedExpandable: ReturnType<typeof serializeExpandable>;
  serializedCustomButtons: ReturnType<typeof serializeCustomButtons>;
  isExportEnabled: boolean;
}

/** @internal */
export function prepareTableViewSerialization<T extends ControllerClass>(
  options: TableViewOptions<InstanceType<T>>,
  state: Omit<
    SerializationState<T>,
    "options" | "serializedRowActions" | "serializedCustomButtons"
  >,
) {
  const declaredCustomButtons = options.customButtons;
  const serializedCustomButtons = serializeCustomButtons(declaredCustomButtons);
  const serializedRowActions = options.rowActions
    ? serializeRowActions(options.rowActions)
    : undefined;
  const declaredCustomRowActions = options.rowActions?.custom;
  const declaredTabs = options.tabs;
  const declaredViews = options.views;
  return {
    serialization: {
      ...state,
      options,
      serializedCustomButtons,
      serializedRowActions,
    },
    declarations: {
      declaredCustomButtons,
      declaredCustomRowActions,
      declaredTabs,
      declaredViews,
      meta: state.meta,
      hasNewEndpoint: !!GetMetadata(state.controller, DataAPIMeta).endpoints
        .new,
    },
  };
}

/**
 * The options a table view registers, and what its filter reads for each
 * request: the declarations, and the columns its options read from the rows.
 * The forms it opens as pages of their own read those columns too.
 *
 * @internal
 */
export function serializeTableView<T extends ControllerClass>(
  prepared: ReturnType<typeof prepareTableViewSerialization<T>>,
) {
  const { serialization, declarations } = prepared;
  const options = serializeTableViewOptions(serialization);
  const columnValues = tableViewColumnValues(
    serialization.controller,
    options,
    serialization.options.tabsFrom,
  );
  for (const form of Object.values(serialization.forms)) {
    if (form && columnValues) readColumnValuesInForm(columnValues, form);
  }
  return { options, declarations: { ...declarations, columnValues } };
}

function serializeTableViewOptions<T extends ControllerClass>(
  state: SerializationState<T>,
): TableViewOptionsSerialized {
  const {
    controller,
    options,
    meta,
    config,
    forms,
    serializedRowActions,
    serializedExpandable,
    serializedCustomButtons,
    isExportEnabled,
  } = state;
  const { new: newForm, edit: editForm, view: viewForm } = forms;
  return {
    ...withHiddenColumns(config, options.columns?.hidden),
    rowActions: serializedRowActions,
    caption: options.caption,
    density: options.density,
    maxHeight: options.maxHeight,
    rowClick: options.rowClick,
    expandable: serializedExpandable,
    enableTableExport: isExportEnabled,
    rowIdKey: options.rowIdKey,
    labelKey: options.labelKey,
    formContainer: options.formContainer,
    archiveMode: options.archiveMode,
    archivedCountLabel: options.archivedCountLabel,
    defaultSort: options.defaultSort,
    pinnedRows: eraseRowType(options.pinnedRows),
    queryParamFilters: options.queryParamFilters,
    routeParamFilters: options.routeParamFilters,
    customButtons: serializedCustomButtons,
    defaultFilters: options.defaultFilters,
    realtimeTopic: options.realtimeTopic,
    liveHold: options.liveHold,
    tabs: serializeTableViewTabs(options.tabs),
    views: serializeTableViewViews(options.views),
    layout: options.layout,
    searchable: hasSearchableFields(controller),
    searchPlaceholder: options.searchPlaceholder,
    searchShortcut: options.searchShortcut,
    quickFilters: options.quickFilters,
    pageSize: options.pageSize,
    pagination: options.pagination,
    reorder: options.reorder,
    inlineEdit: options.inlineEdit,
    footer: serializeFooter(controller.name, meta, options.footer),
    emptyStates: serializeEmptyStates(options.emptyStates),
    displays: serializeTableViewDisplays(options),
    defaultDisplay: options.defaultDisplay,
    mobileDisplay: options.mobileDisplay,
    formComponents: {
      new: newForm ? newForm.serializeSync() : undefined,
      edit: editForm ? editForm.serializeSync() : undefined,
      view: viewForm ? viewForm.serializeSync() : undefined,
    },
  };
}

/** A column of the controller's config, as far as hiding it goes. */
interface HideableColumn {
  id: string;
  isVisible?: boolean;
}

/** The controller's config, as far as its columns go. */
interface ColumnsConfig {
  columns: HideableColumn[];
}

/**
 * The controller's config with the columns a table view hides set to open
 * hidden, as a column declared `isVisible: false` does. The config is the
 * controller's, which other table views share: the table view gets a copy.
 */
function withHiddenColumns<T extends ColumnsConfig>(
  config: T,
  hidden: string[] = [],
): T {
  if (hidden.length === 0) return config;
  const hiddenIds = new Set(hidden);
  return {
    ...config,
    columns: config.columns.map((column) =>
      hiddenIds.has(column.id) ? { ...column, isVisible: false } : column,
    ),
  };
}
