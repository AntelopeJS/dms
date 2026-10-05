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
import { SearchableMeta } from "../searchable";
import { type TableViewAccess, TableViewMeta } from "./meta";
import {
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
  resolveFormPageTexts,
  serializeCustomButtons,
  serializeExpandable,
  serializeRowActions,
  serializeTableViewDisplays,
  TableViewFunctions,
} from "./factory-helpers";
import {
  assertTabTargets,
  resolveTableViewTabs,
  serializeTableViewTabs,
  warnIfTabsLackCountBatch,
} from "./tabs";
import { claimWritingTableView, tableViewAccess } from "./writer";
import {
  assertRowScopedFormSlugs,
  validateDefaultDisplay,
  validateKanbanOptions,
  validatePageSize,
  validateQuickFilters,
} from "./validation";
import { fireAndForget } from "../../utils/fire-and-forget";

export function TableView<T extends ControllerClass>(
  controller: T,
  options: TableViewOptions<InstanceType<T>> = {},
): ComponentBuilder<TableViewOptionsSerialized> {
  const meta = GetMetadata(controller, TableViewMeta);

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
  validateQuickFilters(controller.name, meta, options.quickFilters);
  validatePageSize(controller.name, options.pageSize);
  assertTabTargets(controller.name, options.tabs);

  const serializedExpandable = serializeExpandable(
    controller.name,
    meta,
    options.expandable,
  );

  const capabilities = {
    hasNewForm: meta.getFormFields("new").length > 0,
    hasEditForm: meta.getFormFields("edit").length > 0,
    hasDeleteEndpoint: !!endpoints.delete,
    archiveMode: !!options.archiveMode,
  };
  const access = tableViewAccess(options.rowActions, capabilities);
  const isWriting = access === "write";
  const forms = buildTableViewForms(controller, options, access);
  const { new: newForm, edit: editForm, view: viewForm } = forms;

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

  // Declared from what the controller offers, a read-only TableView's write
  // actions included: they keep guarding the write routes of a controller no
  // TableView writes through.
  registerTableViewActions(builder, {
    ...capabilities,
    hasViewForm: !!viewForm,
    isExportEnabled,
  });

  recordTableView(meta, builder, access, options);

  builder
    .options({
      ...config,
      rowActions: serializedRowActions,
      caption: options.caption,
      density: options.density,
      maxHeight: options.maxHeight,
      expandable: serializedExpandable,
      enableTableExport: isExportEnabled,
      rowIdKey: options.rowIdKey,
      labelKey: options.labelKey,
      formTexts: options.formTexts,
      formContainer: options.formContainer,
      archiveMode: options.archiveMode,
      defaultSort: options.defaultSort,
      queryParamFilters: options.queryParamFilters,
      routeParamFilters: options.routeParamFilters,
      customButtons: serializedCustomButtons,
      defaultFilters: options.defaultFilters,
      tabs: serializeTableViewTabs(options.tabs),
      layout: options.layout,
      searchable:
        Object.keys(
          GetMetadata(controller, SearchableMeta).getSearchableFields(),
        ).length > 0,
      searchPlaceholder: options.searchPlaceholder,
      quickFilters: options.quickFilters,
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

      if (tableViewPermissionId && isWriting) {
        claimWritingTableView(meta, controller.name, {
          owner: tableViewPermissionId,
          page: parentPage,
        });
      }

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

        const texts = resolveFormPageTexts(kind, options, customPages);

        const FormController = class extends parentPage.target {};
        const formMeta = new PageMetadata(FormController as ControllerClass);
        formMeta.SetInfo(
          id,
          fullSlug,
          {
            displayName: texts.title,
            description: texts.description,
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
        // The edit and details pages end their breadcrumb with the row's
        // label once the form has loaded it.
        if (kind !== "new" && options.labelKey) {
          form.mergeOptions({ recordLabelKey: options.labelKey });
        }
        // A record's form page: Cancel leads back to the list while there
        // is nothing to save, as in a drawer or a modal.
        form.mergeOptions({ cancellable: true });
        if (definition.redirectsOnSubmit) {
          applyFormRedirect(
            form,
            buildFormRedirectUrl(frame),
            Object.keys(options.queryParamFilters ?? {}),
          );
        }
        formMeta.SetComponent("form", form);
        fireAndForget(formMeta.Register(), "table view form registration");

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
      );

      return {
        ...options,
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

/**
 * The forms a table view opens. A read-only one opens no form that submits:
 * its files are none the write routes should accept, and it has no form page
 * to register.
 */
function buildTableViewForms<T extends ControllerClass>(
  controller: T,
  options: TableViewOptions<InstanceType<T>>,
  access: TableViewAccess,
): Record<FormPageKind, FormBuilder | undefined> {
  const viewForm = resourceForm(controller, "view", {
    slotId: options.formSlots?.view,
  });
  if (access === "read")
    return { new: undefined, edit: undefined, view: viewForm };
  const submitDefaults = buildFilterSubmitDefaults(options);
  return {
    new: resourceForm(controller, "new", {
      submitDefaults,
      slotId: options.formSlots?.new,
    }),
    edit: resourceForm(controller, "edit", {
      submitDefaults,
      slotId: options.formSlots?.edit,
    }),
    view: viewForm,
  };
}

/**
 * Record a table view on its controller. The writing one's options and rules,
 * archive-mode defaults included, are the ones the data routes apply to every
 * write; a read-only one's options stand in only while none writes.
 */
function recordTableView<T extends ControllerClass>(
  meta: TableViewMeta,
  builder: ComponentBuilder<TableViewOptionsSerialized>,
  access: TableViewAccess,
  options: TableViewOptions<InstanceType<T>>,
): void {
  meta.addComponentBuilder(builder, access);
  if (access === "write") {
    meta.setControllerRowActionRules(options.rowActions ?? {});
  } else if (meta.writingComponentBuilders.length > 0) {
    return;
  }
  meta.setOptions(options);
}

declare module "../types/watch" {
  interface WatchFunctionParamMap {
    [TableViewFunctions.CUSTOM_PAGE_FORM_SUCCESS]: {
      url: string;
      preserveQuery?: string[];
    };
  }
}
