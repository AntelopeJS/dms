/** @internal */
import type { ControllerClass } from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import type { ComponentBuilder } from "../../../component";
import { GetPermissionId, PageMetadata } from "../../../page";
import { claimFormPageRoute } from "../../../page/internal/form-page-routes";
import { resolveInheritedLayout } from "../../../page/internal/categories";
import { fireAndForget } from "../../../utils/fire-and-forget";
import type { FormBuilder } from "../../form-types";
import { FormPageLayout } from "../../layouts";
import type { TableViewMeta } from "../meta";
import type { TableViewOptions, TableViewOptionsSerialized } from "../options";
import {
  applyFormPageSubmitDefaults,
  applyFormRedirect,
  buildFormPageUrls,
  buildFormRedirectUrl,
  FORM_PAGE_DEFINITIONS,
  FORM_PAGE_KINDS,
  formPageConfig,
  type FormPageKind,
  formPageSlug,
  formRouteKey,
  joinPageSlug,
  resolveFormPageTexts,
} from "./factory-helpers";
import {
  registerTableViewCustomTopics,
  registerTableViewPageTopics,
} from "./realtime";
import { assertRowScopedFormSlugs } from "./validation";
import { claimWritingTableView } from "./writer";

interface CreationState<T extends ControllerClass> {
  controller: T;
  options: TableViewOptions<InstanceType<T>>;
  meta: TableViewMeta;
  builder: ComponentBuilder<TableViewOptionsSerialized>;
  config: TableViewMeta["config"];
  isWriting: boolean;
  forms: Record<FormPageKind, FormBuilder | undefined>;
  isPageMode: boolean;
}

/** @internal */
export function tableViewCreated<T extends ControllerClass>(
  state: CreationState<T>,
  parentPage: PageMetadata,
): void {
  const {
    controller,
    options,
    meta,
    builder,
    config,
    isWriting,
    forms,
    isPageMode,
  } = state;
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
  registerTableViewCustomTopics(parentInfo.fullId, options.realtimeTopic);

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

  builder.mergeOptions({
    formPages: buildFormPageUrls(parentInfo.fullSlug, routeKey, customPages),
  });

  assertRowScopedFormSlugs(customPages);

  const registerFormPage = (kind: FormPageKind) => {
    const form = forms[kind];
    if (!form || formPageConfig(kind, customPages)?.customPage) return;

    const definition = FORM_PAGE_DEFINITIONS[kind];
    const urlSlug = formPageSlug(kind, routeKey, customPages);
    const fullSlug = joinPageSlug(parentInfo.fullSlug, urlSlug);
    const id = `${routeKey}.${kind}`;

    claimFormPageRoute({
      owner: tableViewPermissionId,
      pageFullId: parentInfo.fullId,
      kind,
      fullId: `${parentInfo.fullId}.${id}`,
      fullSlug,
    });

    const texts = resolveFormPageTexts(kind, customPages);

    const FormController = class extends parentPage.target {};
    const formMeta = new PageMetadata(FormController);
    formMeta.SetInfo(
      id,
      fullSlug,
      {
        displayName: texts.displayName,
        description: texts.description,
        category: parentInfo,
        urlSlug,
        hidden: true,
        permission: builder.getAction(definition.action),
      },
      resolveInheritedLayout(parentInfo) ?? FormPageLayout(),
    );
    const frame = { pageSlug: parentInfo.fullSlug, formSlug: fullSlug };
    if (definition.submitsFilterDefaults) {
      applyFormPageSubmitDefaults(form, options, frame);
    }
    if (kind !== "new" && options.labelKey) {
      form.mergeOptions({ labelKey: options.labelKey });
    }
    const listUrl = buildFormRedirectUrl(frame);
    form.mergeOptions({ backTo: listUrl });
    if (definition.redirectsOnSubmit) {
      applyFormRedirect(
        form,
        listUrl,
        Object.keys(options.queryParamFilters ?? {}),
      );
    }
    formMeta.SetComponent("form", form);
    fireAndForget(formMeta.Register(), "table view form registration");

    if (options.realtime === false) return;
    registerTableViewPageTopics(`${parentInfo.fullId}.${id}`, config.location);
  };

  for (const kind of FORM_PAGE_KINDS) {
    registerFormPage(kind);
  }
}
