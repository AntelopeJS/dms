import type {
  TableRowActionsConfig,
  TableRowActionServices,
} from "./tableRowActionTypes";
import type { FormProps } from "../../../composables/form/types";
import type { LocationQuery, LocationQueryValue } from "#dms/frontend-module";
import { fillFormPageUrl } from "./useTableViewConfig";
import {
  TableRowAction,
  FormContainerType,
  DEFAULT_FORM_CONTAINER_TYPE,
} from "./types";
import { getItemId, DEFAULT_ROW_ID_KEY } from "./tableRowActionValues";
import type { createTableRowFormContainer } from "./tableRowActionContainers";
export const createTableRowNavigation = <T extends Data>(
  config: TableRowActionsConfig,
  route: TableRowActionServices["route"],
  createFormContainer: ReturnType<typeof createTableRowFormContainer<T>>,
) => {
  const getContainerType = () =>
    config.formContainer?.type ?? DEFAULT_FORM_CONTAINER_TYPE;

  const buildForwardedQuery = (): LocationQuery | undefined => {
    const params = config.queryParamFilters;
    if (!params) return undefined;

    const forwarded: Record<string, LocationQueryValue | LocationQueryValue[]> =
      {};
    for (const param of Object.keys(params)) {
      if (route.query[param] !== undefined) {
        forwarded[param] = route.query[param];
      }
    }
    return Object.keys(forwarded).length > 0 ? forwarded : undefined;
  };

  const openRowByIdImpl = (itemId: string, item?: T) => {
    const viewPageUrl = config.formPages?.view;
    if (getContainerType() === FormContainerType.page && viewPageUrl) {
      navigateDms(fillFormPageUrl(viewPageUrl, config.routeParams, itemId));
      return;
    }

    return createFormContainer({
      action: TableRowAction.view,
      item,
      itemId,
      fetchUrl: `${config.location}/get?id=${itemId}&action=details`,
    });
  };

  const editRowImpl = (
    item: T,
    submitDefaults?: FormProps["submitDefaults"],
  ) => {
    const itemId = getItemId(item, config.rowIdKey ?? DEFAULT_ROW_ID_KEY);

    const editPageUrl = config.formPages?.edit;
    if (
      getContainerType() === FormContainerType.page &&
      itemId &&
      editPageUrl
    ) {
      const forwardedQuery = buildForwardedQuery();
      const target: Parameters<typeof navigateDms>[0] = {
        path: fillFormPageUrl(editPageUrl, config.routeParams, itemId),
      };
      if (forwardedQuery) target.query = forwardedQuery;
      navigateDms(target);
      return;
    }

    return createFormContainer({
      action: TableRowAction.edit,
      item,
      itemId,
      submitDefaults,
    });
  };

  const newRowImpl = (submitDefaults?: FormProps["submitDefaults"]) => {
    const newPageUrl = config.formPages?.new;
    if (getContainerType() === FormContainerType.page && newPageUrl) {
      const forwardedQuery = buildForwardedQuery();
      const target: Parameters<typeof navigateDms>[0] = {
        path: fillFormPageUrl(newPageUrl, config.routeParams),
      };
      if (forwardedQuery) target.query = forwardedQuery;
      navigateDms(target);
      return;
    }

    return createFormContainer({
      action: TableRowAction.new,
      submitDefaults,
    });
  };

  const duplicateRowImpl = (itemId: string) => {
    const newPageUrl = config.formPages?.new;
    if (getContainerType() === FormContainerType.page && newPageUrl) {
      navigateDms({
        path: fillFormPageUrl(newPageUrl, config.routeParams),
        query: { duplicate: itemId },
      });
      return;
    }

    return createFormContainer({
      action: TableRowAction.duplicate,
      itemId,
      fetchUrl: `${config.location}/get?id=${itemId}&action=duplicate`,
    });
  };

  return { openRowByIdImpl, editRowImpl, newRowImpl, duplicateRowImpl };
};
