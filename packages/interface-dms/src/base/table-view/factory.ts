import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import { ComponentBuilder } from "../../component";
import { GetPermissionId, PageMetadata } from "../../page";
import { HasPermission } from "../../permissions";
import { StampUploadFieldTokens } from "../../uploads";
import { getDataTypeId } from "../data-types/core";
import { Form } from "../form-schema";
import { applyArchiveModeDefaultRules } from "../helpers/archive-mode-helpers";
import { FormPageLayout } from "../layouts";
import { FormMode, HttpMethod } from "../types";
import type {
  CustomButton,
  CustomButtonSerialized,
} from "../types/custom-button";
import type { RowActionConfig, RowActionRule } from "../types/row-action";
import { LIST_ACTION, SELECT_ACTION, VIEW_ACTION } from "./auth";
import { TableViewMeta } from "./meta";
import {
  KANBAN_DISPLAY_ID,
  TABLE_DISPLAY_ID,
  TABLE_VIEW_COMPONENT_NAME,
  type TableViewOptions,
  type TableViewOptionsSerialized,
  type TableViewRowActionOptions,
  type TableViewRowActionOptionsSerialized,
} from "./options";
import {
  REALTIME_PRESENCE_ACQUIRE_VALUE,
  REALTIME_PRESENCE_QUERY,
  reportRealtimePageTopic,
} from "./realtime";
import { TableViewRoutes } from "./routes";
import { extractRuleFromConfig } from "./row-rules";
import {
  applyFormRedirect,
  applyPermissionToAction,
  buildFormPageUrls,
  filterCustomButtonsByPermission,
  FORM_PAGE_DEFAULT_SLUGS,
  isNestedComponent,
  joinPageSlug,
  mergeControllerRule,
  serializeTableViewDisplays,
  TableViewFunctions,
  validateKanbanField,
} from "./factory-helpers";
export function TableView<T extends ControllerClass>(
  controller: T,
  options: TableViewOptions<InstanceType<T>> = {},
): ComponentBuilder<TableViewOptionsSerialized> {
  const meta = GetMetadata(controller, TableViewMeta);
  meta.setOptions(options);

  if (options.rowActions) {
    const hasRules = Object.values(options.rowActions).some(
      (config) =>
        typeof config === "object" && config !== null && "rule" in config,
    );
    if (hasRules && !meta.controllerRowActionRules) {
      meta.setControllerRowActionRules(options.rowActions);
    }
  }

  if (options.guards && !meta.controllerGuards) {
    meta.setControllerGuards(options.guards);
  }

  if (options.bypassTenantAccessGate) {
    meta.setBypassTenantAccessGate();
  }
  meta.recordGateBypassRegistration(options.bypassTenantAccessGate === true);
  // The flag is latched controller-wide: once any registration opens the data
  // routes, every other registration of the same controller shares the
  // opening and has no way to re-gate them. Warn as soon as the two kinds
  // coexist, whichever registered first — checking only the later one would
  // stay silent on the exact same end state.
  if (meta.hasMixedGateBypassRegistrations) {
    Logging.Warn(
      `[DMS] TableView on "${controller.name}" is mounted both with and without bypassTenantAccessGate: its data routes stay reachable while a gate denies the tenant, for every page that mounts it.`,
    );
  }

  const { config } = meta;
  const { endpoints } = GetMetadata(controller, DataAPIMeta);

  for (const [columnKey, column] of Object.entries(meta.columns)) {
    const typeId = getDataTypeId(column.type);
    if (typeId === "file" || typeId === "image") {
      const typeOptions = column.type.options as Record<string, unknown>;
      typeOptions.attachmentField = `${config.location}#${columnKey}`;
    }
  }

  const isExportEnabled = Object.keys(TableViewRoutes.ExportRoutes).every(
    (key) => !!endpoints[key],
  );

  if (options.archiveMode) {
    if (!meta.archiveField) {
      throw new Error(
        `TableView with archiveMode enabled requires @ArchiveField decorator on ${controller.name}`,
      );
    }

    options.rowActions = applyArchiveModeDefaultRules(
      options.rowActions,
      meta.archiveField,
    );
  }

  if (options.kanban) {
    validateKanbanField(controller.name, meta, options.kanban.groupByField);
    for (const field of options.kanban.cardFields ?? []) {
      if (!meta.columns[field]) {
        throw new Error(
          `TableView kanban cardFields on ${controller.name} references unknown column "${field}"`,
        );
      }
    }
  }

  if (options.defaultDisplay) {
    const knownDisplayIds = new Set<string>([
      TABLE_DISPLAY_ID,
      ...(options.kanban ? [KANBAN_DISPLAY_ID] : []),
      ...(options.displays?.map((display) => display.id) ?? []),
    ]);
    if (!knownDisplayIds.has(options.defaultDisplay)) {
      throw new Error(
        `TableView on ${controller.name} defaults to display "${options.defaultDisplay}" which is not declared in displays`,
      );
    }
  }

  const formFieldsNew = meta.getFormFields(FormMode.new);
  const formFieldsEdit = meta.getFormFields(FormMode.edit);
  const formFieldsView = meta.getFormFields(FormMode.view);

  // Default the filtered fields from the URL tokens that `queryParamFilters` /
  // `routeParamFilters` apply to the table, so a form opened from a filtered
  // view (any container) inherits that context. The form resolves these tokens
  // at submit time and drops any that are absent.
  const buildFilterSubmitDefaults = (): Record<string, string> | undefined => {
    const defaults: Record<string, string> = {};
    for (const [param, filter] of Object.entries(
      options.queryParamFilters ?? {},
    )) {
      defaults[filter.field] = `{{query.${param}}}`;
    }
    for (const [param, filter] of Object.entries(
      options.routeParamFilters ?? {},
    )) {
      defaults[filter.field] = `{{params.${param}}}`;
    }
    return Object.keys(defaults).length > 0 ? defaults : undefined;
  };
  const filterSubmitDefaults = buildFilterSubmitDefaults();

  const newForm =
    formFieldsNew.length > 0
      ? Form({
          fields: formFieldsNew,
          fetchUrl: `${config.location}/get?id={{query.duplicate}}`,
          fetchUrlMethod: HttpMethod.get,
          submitUrl: `${config.location}/new`,
          submitUrlMethod: HttpMethod.post,
          submitDefaults: filterSubmitDefaults,
        })
      : undefined;
  const editForm =
    formFieldsEdit.length > 0
      ? Form({
          fields: formFieldsEdit,
          fetchUrl: `${config.location}/get?id={{params.id}}&${REALTIME_PRESENCE_QUERY}=${REALTIME_PRESENCE_ACQUIRE_VALUE}`,
          fetchUrlMethod: HttpMethod.get,
          submitUrl: `${config.location}/edit?id={{params.id}}`,
          submitUrlMethod: HttpMethod.put,
          submitDefaults: filterSubmitDefaults,
        })
      : undefined;
  const viewForm =
    formFieldsView.length > 0
      ? Form({
          fields: formFieldsView,
          fetchUrl: `${config.location}/get?id={{params.id}}`,
          fetchUrlMethod: HttpMethod.get,
        })
      : undefined;

  const serializeActionTarget = (
    target: CustomButton["target"],
  ): CustomButtonSerialized["target"] => {
    if (
      target.type === "page" ||
      target.type === "external" ||
      target.type === "api" ||
      target.type === "exportJob"
    ) {
      return target;
    }
    return {
      ...target,
      component: target.component.serializeSync(),
    };
  };

  const declaredCustomButtons = options.customButtons;
  const serializedCustomButtons: CustomButtonSerialized[] | undefined =
    declaredCustomButtons?.map(({ permission: _permission, ...btn }) => ({
      ...btn,
      target: serializeActionTarget(btn.target),
    }));

  const serializeRowActions = (
    rowActions: TableViewRowActionOptions<InstanceType<T>>,
  ): TableViewRowActionOptionsSerialized => ({
    delete: rowActions.delete as boolean | RowActionConfig | undefined,
    archive: rowActions.archive as boolean | RowActionConfig | undefined,
    restore: rowActions.restore as boolean | RowActionConfig | undefined,
    duplicate: rowActions.duplicate as boolean | RowActionConfig | undefined,
    details: rowActions.details as boolean | RowActionConfig | undefined,
    edit: rowActions.edit as boolean | RowActionConfig | undefined,
    copyLink: rowActions.copyLink as boolean | RowActionConfig | undefined,
    add: rowActions.add as boolean | RowActionConfig | undefined,
    hasSelection: rowActions.hasSelection,
    custom: rowActions.custom?.map((action) => ({
      label: action.label,
      icon: action.icon,
      rule: action.rule as RowActionRule | undefined,
      target: serializeActionTarget(action.target),
      isVisible: action.isVisible,
      isDefault: action.isDefault,
    })),
  });

  const serializedRowActions: TableViewRowActionOptionsSerialized | undefined =
    options.rowActions ? serializeRowActions(options.rowActions) : undefined;

  const isPageMode =
    options.formContainer === undefined ||
    options.formContainer.type === "page";
  const builder = new ComponentBuilder<TableViewOptionsSerialized>(
    TABLE_VIEW_COMPONENT_NAME,
  );
  // The table view embeds its new/edit/view forms synchronously into its own
  // options, so it is the async host that claims their upload tokens.
  builder.transformOptions(StampUploadFieldTokens);

  builder.action(LIST_ACTION, {
    title: "$dms.table.action_list",
    icon: "i-ph-list",
  });
  builder.action(SELECT_ACTION, {
    title: "$dms.table.action_select",
    icon: "i-ph-magnifying-glass",
    description: "$dms.table.action_select_description",
    defaultGranted: true,
  });
  if (newForm) {
    builder.action("add", {
      title: "$dms.table.action_add",
      icon: "i-ph-plus",
    });
  }
  if (editForm) {
    builder.action("edit", {
      title: "$dms.table.action_edit",
      icon: "i-ph-pencil",
    });
  }
  if (viewForm) {
    builder.action(VIEW_ACTION, {
      title: "$dms.table.action_view",
      icon: "i-ph-eye",
    });
  }
  if (endpoints.delete) {
    builder.action("delete", {
      title: "$dms.table.action_delete",
      icon: "i-ph-trash",
    });
  }
  if (options.archiveMode) {
    builder.action("archive", {
      title: "$dms.table.action_archive",
      icon: "i-ph-archive",
    });
    builder.action("restore", {
      title: "$dms.table.action_restore",
      icon: "i-ph-arrow-counter-clockwise",
    });
    builder.action("viewArchived", {
      title: "$dms.table.action_view_archived",
      icon: "i-ph-eye-closed",
    });
  }
  if (isExportEnabled) {
    builder.action("export", {
      title: "$dms.table.action_export",
      icon: "i-ph-download-simple",
    });
  }

  meta.componentBuilder = builder;

  builder
    .options({
      ...config,
      rowActions: serializedRowActions,
      caption: options.caption,
      enableTableExport: isExportEnabled,
      rowIdKey: options.rowIdKey,
      labelKey: options.labelKey,
      formContainer: options.formContainer,
      archiveMode: options.archiveMode,
      defaultSort: options.defaultSort,
      queryParamFilters: options.queryParamFilters,
      routeParamFilters: options.routeParamFilters,
      customButtons: serializedCustomButtons,
      defaultFilters: options.defaultFilters,
      tabs: options.tabs,
      displays: serializeTableViewDisplays(options.displays, options.kanban),
      defaultDisplay: options.defaultDisplay,
      formComponents: {
        new: newForm ? newForm.serializeSync() : undefined,
        edit: editForm ? editForm.serializeSync() : undefined,
        view: viewForm ? viewForm.serializeSync() : undefined,
      },
    })
    .meta({
      name: options.caption || "TableView",
      icon: "i-ph-table",
    })
    .onCreated((parentPage: PageMetadata) => {
      const parentInfo = parentPage.pageInfo;
      if (!parentInfo) {
        throw new Error("Parent page info not found");
      }

      const customPages =
        options.formContainer?.type === "page"
          ? options.formContainer.pages
          : undefined;

      // Resolved before any of the early returns below: a form page the table
      // view declines to register — a nested table view, a `customPage` entry —
      // is still the one the frontend navigates to.
      if (isPageMode) {
        builder.mergeOptions({
          formPages: buildFormPageUrls(parentInfo.fullSlug, customPages),
        });
      }

      const tableViewPermissionId = GetPermissionId(builder);

      if (options.realtime !== false) {
        reportRealtimePageTopic({
          pageId: parentInfo.fullId,
          controllerLocation: config.location,
        });
      }

      if (!tableViewPermissionId) {
        Logging.Warn("TableView permission ID not found");
        return;
      }

      if (!isPageMode) {
        return;
      }

      // Page-mode form routes are named after the page, not after the table
      // view, so two of them on one page would claim the same fullId and slug —
      // the second registration disposing the first. A table view the page
      // mounts directly keeps them; one nested in a layout component (which
      // registered no form route at all before nested components were walked)
      // goes without rather than take the page's own.
      if (isNestedComponent(tableViewPermissionId, parentInfo.fullId)) {
        Logging.Warn(
          `[DMS] TableView "${tableViewPermissionId}" is nested inside another component: its page-mode form routes are not registered, as they would collide with those of the page's own table views. Use a drawer or modal formContainer, or mount it as a component of the page.`,
        );
        return;
      }

      if (
        customPages?.edit?.urlSlug &&
        !customPages.edit.urlSlug.includes(":id")
      ) {
        throw new Error(
          `TableView formContainer.pages.edit.urlSlug must contain :id placeholder. Got: ${customPages.edit.urlSlug}`,
        );
      }
      if (
        customPages?.view?.urlSlug &&
        !customPages.view.urlSlug.includes(":id")
      ) {
        throw new Error(
          `TableView formContainer.pages.view.urlSlug must contain :id placeholder. Got: ${customPages.view.urlSlug}`,
        );
      }

      const registerSubPageTopic = (subPageFullId: string) => {
        if (options.realtime === false) return;
        reportRealtimePageTopic({
          pageId: subPageFullId,
          controllerLocation: config.location,
        });
      };

      if (newForm && !customPages?.new?.customPage) {
        const NewController = class extends parentPage.target {};
        const newMeta = new PageMetadata(NewController as ControllerClass);
        const newUrlSlug =
          customPages?.new?.urlSlug || FORM_PAGE_DEFAULT_SLUGS.new;
        const newFullSlug = joinPageSlug(parentInfo.fullSlug, newUrlSlug);
        newMeta.SetInfo(
          "new",
          newFullSlug,
          {
            displayName: customPages?.new?.displayName || "$dms.table.new_item",
            description:
              customPages?.new?.description ||
              "$dms.table.new_item_description",
            category: parentInfo,
            urlSlug: newUrlSlug,
            hidden: true,
            permission: builder.getAction("add"),
          },
          FormPageLayout(),
        );
        applyFormRedirect(
          newForm,
          parentInfo.fullSlug,
          Object.keys(options.queryParamFilters ?? {}),
        );
        newMeta.SetComponent("form", newForm);
        void newMeta.Register();
        registerSubPageTopic(`${parentInfo.fullId}.new`);
      }

      if (editForm && !customPages?.edit?.customPage) {
        const EditController = class extends parentPage.target {};
        const editMeta = new PageMetadata(EditController as ControllerClass);
        const editUrlSlug =
          customPages?.edit?.urlSlug || FORM_PAGE_DEFAULT_SLUGS.edit;
        const editFullSlug = joinPageSlug(parentInfo.fullSlug, editUrlSlug);
        editMeta.SetInfo(
          "edit",
          editFullSlug,
          {
            displayName:
              customPages?.edit?.displayName || "$dms.table.edit_item",
            description:
              customPages?.edit?.description ||
              "$dms.table.edit_item_description",
            category: parentInfo,
            urlSlug: editUrlSlug,
            hidden: true,
            permission: builder.getAction("edit"),
          },
          FormPageLayout(),
        );
        applyFormRedirect(
          editForm,
          parentInfo.fullSlug,
          Object.keys(options.queryParamFilters ?? {}),
        );
        editMeta.SetComponent("form", editForm);
        void editMeta.Register();
        registerSubPageTopic(`${parentInfo.fullId}.edit`);
      }

      if (viewForm && !customPages?.view?.customPage) {
        const ViewController = class extends parentPage.target {};
        const viewMeta = new PageMetadata(ViewController as ControllerClass);
        const viewUrlSlug =
          customPages?.view?.urlSlug || FORM_PAGE_DEFAULT_SLUGS.view;
        const viewFullSlug = joinPageSlug(parentInfo.fullSlug, viewUrlSlug);
        viewMeta.SetInfo(
          "view",
          viewFullSlug,
          {
            displayName:
              customPages?.view?.displayName || "$dms.table.view_item",
            description:
              customPages?.view?.description ||
              "$dms.table.view_item_description",
            category: parentInfo,
            urlSlug: viewUrlSlug,
            hidden: true,
            permission: builder.getAction("view"),
          },
          FormPageLayout(),
        );
        viewMeta.SetComponent("form", viewForm);
        void viewMeta.Register();
        registerSubPageTopic(`${parentInfo.fullId}.view`);
      }
    })
    .onFilter(async (permissions, options, permissionId) => {
      const hasAddPermission = await HasPermission(
        permissions,
        `${permissionId}.add`,
      );
      const hasEditPermission = await HasPermission(
        permissions,
        `${permissionId}.edit`,
      );
      const hasDeletePermission = await HasPermission(
        permissions,
        `${permissionId}.delete`,
      );
      const hasViewPermission = await HasPermission(
        permissions,
        `${permissionId}.view`,
      );
      const hasArchivePermission = await HasPermission(
        permissions,
        `${permissionId}.archive`,
      );
      const hasRestorePermission = await HasPermission(
        permissions,
        `${permissionId}.restore`,
      );
      const hasViewArchivedPermission = await HasPermission(
        permissions,
        `${permissionId}.viewArchived`,
      );

      const adaptedFormComponents = {
        new: hasAddPermission ? options.formComponents.new : undefined,
        edit: hasEditPermission ? options.formComponents.edit : undefined,
        view: hasViewPermission ? options.formComponents.view : undefined,
      };

      const adaptedRowActions: TableViewRowActionOptionsSerialized = {
        add: applyPermissionToAction(hasAddPermission, options.rowActions?.add),
        edit: applyPermissionToAction(
          hasEditPermission,
          options.rowActions?.edit,
        ),
        duplicate: applyPermissionToAction(
          hasAddPermission,
          options.rowActions?.duplicate,
        ),
        delete: applyPermissionToAction(
          hasDeletePermission,
          options.rowActions?.delete,
        ),
        archive: options.archiveMode
          ? applyPermissionToAction(
              hasArchivePermission,
              options.rowActions?.archive,
            )
          : undefined,
        restore: options.archiveMode
          ? applyPermissionToAction(
              hasRestorePermission,
              options.rowActions?.restore,
            )
          : undefined,
        showArchived: options.archiveMode
          ? hasViewArchivedPermission
          : undefined,
        details: applyPermissionToAction(
          hasViewPermission,
          options.rowActions?.details,
        ),
        copyLink: applyPermissionToAction(
          hasViewPermission,
          options.rowActions?.copyLink,
        ),
        hasSelection: options.rowActions?.hasSelection,
        custom: options.rowActions?.custom,
      };

      const controllerRules = meta.controllerRowActionRules;
      if (controllerRules) {
        for (const actionName of [
          "edit",
          "delete",
          "archive",
          "restore",
        ] as const) {
          adaptedRowActions[actionName] = mergeControllerRule(
            adaptedRowActions[actionName],
            extractRuleFromConfig(controllerRules, actionName),
          );
        }
      }

      const editHasNoRules =
        adaptedRowActions.edit === true ||
        (typeof adaptedRowActions.edit === "object" &&
          !adaptedRowActions.edit.rule);

      if (editHasNoRules) {
        adaptedRowActions.details = false;
      }

      const adaptedCustomButtons = await filterCustomButtonsByPermission(
        permissions,
        declaredCustomButtons,
        options.customButtons,
        permissionId,
      );

      return {
        ...options,
        formComponents: adaptedFormComponents,
        rowActions: adaptedRowActions,
        customButtons: adaptedCustomButtons,
      };
    });

  return builder;
}

declare module "../types/watch" {
  interface WatchFunctionParamMap {
    [TableViewFunctions.CUSTOM_PAGE_FORM_SUCCESS]: {
      url: string;
      preserveQuery?: string[];
    };
  }
}
