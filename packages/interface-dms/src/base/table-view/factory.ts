import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import { ComponentBuilder } from "../../component";
import { GetPermissionId, PageMetadata } from "../../page";
import { claimFormPageRoute } from "../../page/form-page-routes";
import { StampUploadFieldTokens } from "../../uploads";
import type { FormBuilder } from "../form-types";
import { applyArchiveModeDefaultRules } from "../helpers/archive-mode-helpers";
import { FormPageLayout } from "../layouts";
import { LIST_ACTION, SELECT_ACTION } from "./auth";
import { TableViewMeta } from "./meta";
import {
  DEFAULT_ROW_ID_FIELD,
  TABLE_VIEW_COMPONENT_NAME,
  type TableViewOptions,
  type TableViewOptionsSerialized,
} from "./options";
import { registerTableViewPageTopics } from "./realtime";
import {
  adaptRowActions,
  resolveCustomButtons,
  resolveCustomRowActions,
  resolveTableViewGrants,
} from "./request-filter";
import { resourceForm, stampAttachmentFields } from "./resource-form";
import { TableViewRoutes } from "./routes";
import {
  applyFormPageSubmitDefaults,
  applyFormRedirect,
  buildFilterSubmitDefaults,
  buildFormPageUrls,
  buildFormRedirectUrl,
  FORM_PAGE_DEFINITIONS,
  FORM_PAGE_KINDS,
  type FormPageKind,
  formPageSlug,
  formRouteKey,
  joinPageSlug,
  registerTableViewActions,
  serializeCustomButtons,
  serializeExpandable,
  serializeRowActions,
  serializeTableViewDisplays,
  TableViewFunctions,
} from "./factory-helpers";
import {
  resolveTableViewTabs,
  serializeTableViewTabs,
  warnIfTabsLackCountBatch,
} from "./tabs";
import { appendTableViewKey, withTableViewKeyOnSubmit } from "./table-view-key";
import {
  assertKnownColumns,
  assertRowScopedFormSlugs,
  validateDefaultDisplay,
  validateKanbanOptions,
  validateQuickFilters,
} from "./validation";

export function TableView<T extends ControllerClass>(
  controller: T,
  options: TableViewOptions<InstanceType<T>> = {},
): ComponentBuilder<TableViewOptionsSerialized> {
  const meta = GetMetadata(controller, TableViewMeta);
  meta.setOptions(options);

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
  warnIfTabsLackCountBatch(
    controller,
    config.location,
    (options.tabs?.length ?? 0) > 0,
    endpoints,
  );

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

  validateKanbanOptions(controller.name, meta, options.kanban);
  validateDefaultDisplay(controller.name, options);
  assertKnownColumns(
    controller.name,
    meta,
    "hiddenColumns",
    options.hiddenColumns ?? [],
  );
  validateQuickFilters(controller.name, meta, options.quickFilters);

  const serializedExpandable = serializeExpandable(
    controller.name,
    meta,
    options.expandable,
  );

  const filterSubmitDefaults = buildFilterSubmitDefaults(options);

  const newForm = resourceForm(controller, "new", {
    submitDefaults: filterSubmitDefaults,
    slotId: options.formSlots?.new,
  });
  const editForm = resourceForm(controller, "edit", {
    submitDefaults: filterSubmitDefaults,
    slotId: options.formSlots?.edit,
  });
  const viewForm = resourceForm(controller, "view", {
    slotId: options.formSlots?.view,
  });

  const declaredCustomButtons = options.customButtons;
  const serializedCustomButtons = serializeCustomButtons(declaredCustomButtons);
  const serializedRowActions = options.rowActions
    ? serializeRowActions(options.rowActions)
    : undefined;
  // Kept for the per-request filter, whose `options` are the serialized ones.
  const declaredCustomRowActions = options.rowActions?.custom;
  const declaredTabs = options.tabs;

  const isPageMode =
    options.formContainer === undefined ||
    options.formContainer.type === "page";
  const builder = new ComponentBuilder<TableViewOptionsSerialized>(
    TABLE_VIEW_COMPONENT_NAME,
  );
  // The table view embeds its new/edit/view forms synchronously into its own
  // options, so it is the async host that claims their upload tokens.
  builder.transformOptions(StampUploadFieldTokens);
  for (const { id, permission } of declaredCustomButtons ?? []) {
    if (id) builder.button(id, { permission });
  }

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
  registerTableViewActions(builder, {
    hasNewForm: !!newForm,
    hasEditForm: !!editForm,
    hasViewForm: !!viewForm,
    hasDeleteEndpoint: !!endpoints.delete,
    archiveMode: !!options.archiveMode,
    isExportEnabled,
  });

  meta.addComponentBuilder(builder);
  // This table's rules, archive-mode defaults included, enforced on the
  // writes that come from it — never on another table sharing the controller.
  meta.setRowScope(builder, {
    rowActions: options.rowActions,
    idField: options.rowIdKey || DEFAULT_ROW_ID_FIELD,
    strictMode: options.strictRuleValidation ?? false,
  });

  builder
    .options({
      ...config,
      rowActions: serializedRowActions,
      caption: options.caption,
      density: options.density,
      stickyHeader: options.stickyHeader,
      maxHeight: options.maxHeight,
      expandable: serializedExpandable,
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
      tabs: serializeTableViewTabs(options.tabs),
      chrome: options.chrome,
      searchPlaceholder: options.searchPlaceholder,
      quickFilters: options.quickFilters,
      hiddenColumns: options.hiddenColumns,
      pageSize: options.pageSize,
      footer: options.footer,
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
        registerTableViewPageTopics(parentInfo.fullId, config.location);
      }

      if (!tableViewPermissionId) {
        Logging.Warn("TableView permission ID not found");
        return;
      }

      if (!isPageMode) {
        return;
      }

      const routeKey = formRouteKey(
        tableViewPermissionId,
        GetPermissionId(parentPage.target) ?? parentInfo.fullId,
      );

      // Every kind, `customPage` entries included: they register no sub-page
      // below and are still the URL the frontend navigates to.
      builder.mergeOptions({
        formPages: buildFormPageUrls(
          parentInfo.fullSlug,
          routeKey,
          customPages,
        ),
      });

      assertRowScopedFormSlugs(customPages);

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
        if (kind === "edit") {
          const submitUrl = form.serializeSync().options?.submitUrl;
          if (submitUrl) {
            form.mergeOptions({
              submitUrl: appendTableViewKey(submitUrl, tableViewPermissionId),
            });
          }
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
        registerTableViewPageTopics(
          `${parentInfo.fullId}.${id}`,
          config.location,
        );
      };

      for (const kind of FORM_PAGE_KINDS) {
        registerFormPage(kind);
      }
    })
    .onFilter(async (permissions, options, permissionId, context) => {
      const grants = await resolveTableViewGrants(permissions, permissionId);

      // Writes name the table they come from, so its permission and row
      // rules — not another table's over the same controller — apply.
      const tableViewKey = GetPermissionId(builder) ?? permissionId;
      const adaptedFormComponents = {
        new: grants.add ? options.formComponents.new : undefined,
        edit: grants.edit
          ? withTableViewKeyOnSubmit(options.formComponents.edit, tableViewKey)
          : undefined,
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
      );

      return {
        ...options,
        tableViewKey,
        // The export routes refuse a caller without the action: its toolbar
        // entry is left out too, like the add/edit/delete buttons.
        enableTableExport: options.enableTableExport && grants.export,
        formComponents: adaptedFormComponents,
        rowActions: adaptedRowActions,
        customButtons: adaptedCustomButtons,
        tabs: adaptedTabs,
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
