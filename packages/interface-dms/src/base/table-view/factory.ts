import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import { ComponentBuilder } from "../../component";
import { StampUploadFieldTokens } from "../../uploads";
import type { FormBuilder } from "../form-types";
import { applyArchiveModeDefaultRules } from "../helpers/archive-mode-helpers";
import { type TableViewAccess, TableViewMeta } from "./meta";
import { TABLE_VIEW_COMPONENT_NAME } from "./internal/options";
import type { TableViewOptions, TableViewOptionsSerialized } from "./options";
import { resourceForm, stampAttachmentFields } from "./internal/resource-form";
import { TableViewRoutes } from "./routes";
import {
  buildFilterSubmitDefaults,
  FORM_PAGE_KINDS,
  type FormPageKind,
  registerTableViewActions,
  serializeExpandable,
} from "./internal/factory-helpers";
import { TableViewFunctions } from "./factory-helpers";
import { declaresCounters, warnIfTabsLackCountBatch } from "./internal/tabs";
import { declareTabNavBadges } from "./internal/nav-badges";
import { warnIfSummaryLacksRoute } from "./internal/footer";
import { tableViewAccess } from "./internal/writer";
import { tableViewFromSource } from "./source";
import { validateTableViewOptions } from "./internal/validation";
import { tableViewCreated } from "./internal/factory-lifecycle-created";
import { filterTableViewOptions } from "./internal/factory-lifecycle-filter";
import {
  prepareTableViewSerialization,
  serializeTableViewOptions,
} from "./internal/factory-lifecycle-options";

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
  if (meta.hasMixedGateBypassRegistrations) {
    Logging.Warn(
      `[DMS] TableView on "${controller.name}" is mounted both with and without bypassTenantAccessGate: its data routes stay reachable while a gate denies the tenant, for every page that mounts it.`,
    );
  }

  const { config } = meta;
  const { endpoints } = GetMetadata(controller, DataAPIMeta);
  warnIfTabsLackCountBatch(
    controller,
    controller.location,
    declaresCounters(options),
    endpoints,
  );

  warnIfSummaryLacksRoute(
    controller,
    controller.location,
    options.footer,
    endpoints,
  );

  stampAttachmentFields(meta, controller.location);

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

  validateTableViewOptions(controller.name, meta, options);

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
  const { view: viewForm } = forms;

  const prepared = prepareTableViewSerialization(options, {
    controller,
    meta,
    config,
    forms,
    serializedExpandable,
    isExportEnabled,
  });

  const isPageMode =
    options.formContainer === undefined ||
    options.formContainer.type === "page";
  const builder = new ComponentBuilder<TableViewOptionsSerialized>(
    TABLE_VIEW_COMPONENT_NAME,
  );
  builder.transformOptions(StampUploadFieldTokens);
  for (const { id, permission, permissionId } of prepared.declarations
    .declaredCustomButtons ?? []) {
    if (id) builder.button(id, { permission, permissionId });
  }
  declareTabNavBadges(builder, options.tabs, controller);

  registerTableViewActions(builder, {
    ...capabilities,
    hasViewForm: !!viewForm,
    isExportEnabled,
    formsArePages: isPageMode,
  });

  recordTableView(meta, builder, access, options);

  builder
    .options(serializeTableViewOptions(prepared.serialization))
    .meta({
      name: options.caption || "TableView",
      icon: "i-ph-table",
    })
    .onCreated((parentPage) => {
      tableViewCreated(
        {
          controller,
          options,
          meta,
          builder,
          isWriting,
          forms,
          isPageMode,
        },
        parentPage,
      );
    })
    .onFilter((permissions, options, permissionId, context) => {
      return filterTableViewOptions(prepared.declarations, [
        permissions,
        options,
        permissionId,
        context,
      ]);
    });

  return builder;
}

/**
 * A read-only table view over a module's own route, without a data
 * controller: see {@link tableViewFromSource}.
 */
TableView.fromSource = tableViewFromSource;

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
  const submitDefaults = buildFilterSubmitDefaults(options);
  const forms: Record<FormPageKind, FormBuilder | undefined> =
    access === "read"
      ? { new: undefined, edit: undefined, view: viewForm }
      : {
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
  for (const kind of FORM_PAGE_KINDS) {
    const form = forms[kind];
    if (form) options.forms?.[kind]?.(form);
  }
  return forms;
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
