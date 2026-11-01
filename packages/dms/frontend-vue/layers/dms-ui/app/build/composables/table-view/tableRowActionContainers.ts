import type {
  TableRowActionsConfig,
  TableRowActionServices,
} from "./tableRowActionTypes";
import type { FormProps } from "../../../composables/form/types";
import {
  TableRowAction,
  FormContainerType,
  DEFAULT_FORM_CONTAINER_TYPE,
} from "./types";
import DmsForm from "../../../components/form/Form.vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import {
  resolveFormContainerTexts,
  type TableViewFormKind,
} from "./utils/formTexts";
import { dmsOwnDrawer } from "../containers/context";
const DEFAULT_MODAL_SIZE = "xl";
export interface FormContainerConfig<T extends Data> {
  action: TableRowAction;
  item?: T;
  itemId?: string;
  fetchUrl?: string;
  submitDefaults?: FormProps["submitDefaults"];
}

interface ResolvedFormContainer {
  title: string;
  description: string;
  containerId: string;
  componentIdSuffix: string;
  pageIdSuffix: string;
  processedOptions: FormProps | undefined;
}
/** The form a row action opens: a duplicate opens the add form. */
const formKindOf = (action: TableRowAction): TableViewFormKind => {
  if (action === TableRowAction.edit) return "edit";
  if (action === TableRowAction.view) return "view";
  return "new";
};
const buildContainerIds = (
  config: TableRowActionsConfig,
  action: TableRowAction,
  itemId?: string,
) => {
  const containerId = itemId
    ? `${config.pageId}-${config.componentId}-${action}-${itemId}`
    : `${config.pageId}-${config.componentId}-${action}`;
  const componentIdSuffix = action === "duplicate" ? "new" : action;
  const pageIdSuffix = itemId
    ? `${config.pageId}-${itemId}`
    : `${config.pageId}-new`;
  return { containerId, componentIdSuffix, pageIdSuffix };
};

const processFormOptions = (
  formComponent: ComponentInfo<FormProps>,
  itemId?: string,
) => {
  if (!itemId || !formComponent.options) return formComponent.options;
  return {
    ...formComponent.options,
    ...(formComponent.options.fetchUrl && {
      fetchUrl: formComponent.options.fetchUrl.replace("{{params.id}}", itemId),
    }),
    ...(formComponent.options.submitUrl && {
      submitUrl: formComponent.options.submitUrl.replace(
        "{{params.id}}",
        itemId,
      ),
    }),
  };
};

const createContainerOpeners = (
  config: TableRowActionsConfig,
  services: TableRowActionServices,
) => {
  const { openModal, openDrawer } = services;
  const openModalContainer = (
    resolved: ResolvedFormContainer,
    overrides: Pick<FormContainerConfig<Data>, "fetchUrl" | "submitDefaults">,
  ) => {
    const {
      title,
      description,
      containerId,
      componentIdSuffix,
      pageIdSuffix,
      processedOptions,
    } = resolved;
    const { fetchUrl, submitDefaults } = overrides;
    const size =
      config.formContainer?.type === FormContainerType.modal &&
      config.formContainer.size
        ? config.formContainer.size
        : DEFAULT_MODAL_SIZE;

    const modal = openModal({
      title,
      description,
      size,
      containerId,
      component: DmsForm,
      componentOptions: {
        ...processedOptions,
        ...(fetchUrl && { fetchUrl }),
        ...(submitDefaults && { submitDefaults }),
        componentId: `${config.componentId}-${componentIdSuffix}`,
        pageId: pageIdSuffix,
        containerId,
        onSuccessCallback: () => {
          modal.close();
          config.refreshCallback?.();
        },
      },
    });
    return modal;
  };

  const openDrawerContainer = (
    resolved: ResolvedFormContainer,
    overrides: Pick<FormContainerConfig<Data>, "fetchUrl" | "submitDefaults">,
  ) => {
    const {
      title,
      description,
      containerId,
      componentIdSuffix,
      pageIdSuffix,
      processedOptions,
    } = resolved;
    const { fetchUrl, submitDefaults } = overrides;
    const drawer = openDrawer(
      dmsOwnDrawer({
        title,
        description,
        containerId,
        sizeKey: `${config.pageId}-${config.componentId}-form`,
        component: DmsForm,
        componentOptions: {
          ...processedOptions,
          ...(fetchUrl && { fetchUrl }),
          ...(submitDefaults && { submitDefaults }),
          componentId: `${config.componentId}-${componentIdSuffix}`,
          pageId: pageIdSuffix,
          containerId,
          onSuccessCallback: () => {
            drawer.close();
            config.refreshCallback?.();
          },
        },
      }),
    );
    return drawer;
  };

  const containerHandlers: Partial<
    Record<
      FormContainerType,
      typeof openModalContainer | typeof openDrawerContainer
    >
  > = {
    [FormContainerType.modal]: openModalContainer,
    [FormContainerType.drawer]: openDrawerContainer,
  };

  return containerHandlers;
};

export const createTableRowFormContainer = <T extends Data>(
  config: TableRowActionsConfig,
  services: TableRowActionServices,
) => {
  const { locale, processI18n, t } = services;
  const containerHandlers = createContainerOpeners(config, services);
  const getContainerType = () =>
    config.formContainer?.type ?? DEFAULT_FORM_CONTAINER_TYPE;

  const buildContainerTexts = (action: TableRowAction, item: T | undefined) => {
    const kind = formKindOf(action);
    return resolveFormContainerTexts(
      {
        kind,
        pages: config.formContainer?.pages,
        caption: config.caption,
        recordLabel:
          item && config.labelKey && kind !== "new"
            ? get(item, config.labelKey)
            : undefined,
        locale: locale.value,
      },
      processI18n,
      t,
    );
  };

  const resolveFormComponent = (action: TableRowAction) => {
    const mode =
      action === TableRowAction.duplicate ? TableRowAction.new : action;
    return config.formComponents[mode];
  };

  const buildResolvedFormContainer = (
    action: TableRowAction,
    item: T | undefined,
    itemId: string | undefined,
    formComponent: ComponentInfo<FormProps>,
  ): ResolvedFormContainer => {
    const { containerId, componentIdSuffix, pageIdSuffix } = buildContainerIds(
      config,
      action,
      itemId,
    );
    return {
      ...buildContainerTexts(action, item),
      containerId,
      componentIdSuffix,
      pageIdSuffix,
      processedOptions: processFormOptions(formComponent, itemId),
    };
  };

  const dispatchFormContainer = (
    containerType: FormContainerType,
    resolved: ResolvedFormContainer,
    containerConfig: FormContainerConfig<T>,
  ) => {
    const { fetchUrl, submitDefaults } = containerConfig;
    const handler = containerHandlers[containerType];
    if (
      handler === containerHandlers[FormContainerType.modal] ||
      handler === containerHandlers[FormContainerType.drawer]
    ) {
      return handler?.(resolved, { fetchUrl, submitDefaults });
    }
    if (handler == null) return;
    // oxlint-disable-next-line anti-slop/no-reflect-apply -- Malformed container types can name inherited Object.prototype methods. Preserve their original unbound positional call rather than passing the normal form request.
    return Reflect.apply(handler, undefined, [
      resolved.title,
      resolved.description,
      resolved.containerId,
      resolved.componentIdSuffix,
      resolved.pageIdSuffix,
      resolved.processedOptions,
      fetchUrl,
      submitDefaults,
    ]);
  };

  const createFormContainer = (containerConfig: FormContainerConfig<T>) => {
    const formComponent = resolveFormComponent(containerConfig.action);
    if (!formComponent) {
      return;
    }

    const resolved = buildResolvedFormContainer(
      containerConfig.action,
      containerConfig.item,
      containerConfig.itemId,
      formComponent,
    );

    return dispatchFormContainer(getContainerType(), resolved, containerConfig);
  };

  return createFormContainer;
};
