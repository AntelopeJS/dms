import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import { ComponentBuilder } from "../../component";
import { GetPermissionId, PageMetadata } from "../../page";
import { claimFormPageRoute } from "../../page/form-page-routes";
import { HasPermission } from "../../permissions";
import { StampUploadFieldTokens } from "../../uploads";
import type { FormBuilder } from "../form-types";
import { applyArchiveModeDefaultRules } from "../helpers/archive-mode-helpers";
import { FormPageLayout } from "../layouts";
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
import { reportRealtimePageTopic } from "./realtime";
import { resourceForm, stampAttachmentFields } from "./resource-form";
import { TableViewRoutes } from "./routes";
import { extractRuleFromConfig } from "./row-rules";
import {
  applyFormPageSubmitDefaults,
  applyFormRedirect,
  applyPermissionToAction,
  buildFilterSubmitDefaults,
  buildFormPageUrls,
  buildFormRedirectUrl,
  filterCustomButtonsByPermission,
  FORM_PAGE_DEFINITIONS,
  FORM_PAGE_KINDS,
  type FormPageKind,
  formPageSlug,
  formRouteKey,
  joinPageSlug,
  mergeControllerRule,
  serializeTableViewDisplays,
  ROW_SCOPED_FORM_PAGE_KINDS,
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

  stampAttachmentFields(meta, config.location);

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

  const filterSubmitDefaults = buildFilterSubmitDefaults(options);

  const newForm = resourceForm(controller, "new", {
    submitDefaults: filterSubmitDefaults,
  });
  const editForm = resourceForm(controller, "edit", {
    submitDefaults: filterSubmitDefaults,
  });
  const viewForm = resourceForm(controller, "view");

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

      const routeKey = formRouteKey(tableViewPermissionId, parentInfo.fullId);

      // Resolved before the early return below: a `customPage` entry registers
      // no sub-page and is still the URL the frontend navigates to.
      if (isPageMode) {
        builder.mergeOptions({
          formPages: buildFormPageUrls(
            parentInfo.fullSlug,
            routeKey,
            customPages,
          ),
        });
      }

      if (!isPageMode) {
        return;
      }

      for (const kind of ROW_SCOPED_FORM_PAGE_KINDS) {
        const declared = customPages?.[kind]?.urlSlug;
        if (declared && !declared.includes(":id")) {
          throw new Error(
            `TableView formContainer.pages.${kind}.urlSlug must contain :id placeholder. Got: ${declared}`,
          );
        }
      }

      const forms: Record<FormPageKind, FormBuilder | undefined> = {
        new: newForm,
        edit: editForm,
        view: viewForm,
      };

      const registerFormPage = (kind: FormPageKind) => {
        const form = forms[kind];
        if (!form || customPages?.[kind]?.customPage) return;

        const definition = FORM_PAGE_DEFINITIONS[kind];
        const urlSlug = formPageSlug(kind, routeKey, customPages);
        const fullSlug = joinPageSlug(parentInfo.fullSlug, urlSlug);
        // The page's own id would be the same for every table view it carries,
        // so the sub-page is filed under the table view's key as well.
        const id = `${routeKey}.${kind}`;

        claimFormPageRoute({
          owner: tableViewPermissionId,
          pageFullId: parentInfo.fullId,
          kind,
          fullId: `${parentInfo.fullId}.${id}`,
          fullSlug,
        });

        const FormController = class extends parentPage.target {};
        const formMeta = new PageMetadata(FormController as ControllerClass);
        formMeta.SetInfo(
          id,
          fullSlug,
          {
            displayName:
              customPages?.[kind]?.displayName || definition.displayName,
            description:
              customPages?.[kind]?.description || definition.description,
            category: parentInfo,
            urlSlug,
            hidden: true,
            permission: builder.getAction(definition.action),
          },
          FormPageLayout(),
        );
        const frame = { pageSlug: parentInfo.fullSlug, formSlug: fullSlug };
        if (definition.submitsFilterDefaults) {
          applyFormPageSubmitDefaults(form, options, frame);
        }
        if (definition.redirectsOnSubmit) {
          applyFormRedirect(
            form,
            buildFormRedirectUrl(frame),
            Object.keys(options.queryParamFilters ?? {}),
          );
        }
        formMeta.SetComponent("form", form);
        void formMeta.Register();

        if (options.realtime === false) return;
        reportRealtimePageTopic({
          pageId: `${parentInfo.fullId}.${id}`,
          controllerLocation: config.location,
        });
      };

      for (const kind of FORM_PAGE_KINDS) {
        registerFormPage(kind);
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
