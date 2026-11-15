import type { LocationQueryValue } from "#dms/frontend-module";
import type { WatchAction } from "#dms-core/app/types/watch";
import { isNull, isObject, isString } from "#dms-core/app/utils/type-check";
import { resolveLinkVariables } from "../../utils/urlVariables";
import { detach } from "./utils/detach";

type RouteQuery = Record<string, LocationQueryValue | LocationQueryValue[]>;

export interface FormSuccessParams {
  url: string;
  preserveQuery?: string[];
}

export interface FormSuccessRoute {
  query: RouteQuery;
  params?: Record<string, string>;
}

interface FormSuccessTarget {
  path: string;
  query?: RouteQuery;
}

/**
 * Where a page-mode form sends the user on submit: the page carrying the table
 * view. Its URL holds a `{{params.X}}` token per placeholder of that page's
 * slug, resolved against the parameters of the form route being left, the way
 * `redirectOnSuccess` is.
 */
export function resolveFormSuccessTarget(
  { url, preserveQuery }: FormSuccessParams,
  route: FormSuccessRoute,
): FormSuccessTarget {
  const path = resolveLinkVariables(url, {
    routeParams: route.params,
    routeQuery: route.query,
  });

  const query: RouteQuery = {};
  for (const key of preserveQuery ?? []) {
    if (route.query[key] !== undefined) {
      query[key] = route.query[key];
    }
  }

  const target: FormSuccessTarget = { path };
  if (Object.keys(query).length > 0) target.query = query;
  return target;
}

const isFormSuccessParams = (value: unknown): value is FormSuccessParams => {
  if (!isObject(value) || isNull(value) || !isString(value.url)) return false;
  const { preserveQuery } = value;
  return (
    preserveQuery === undefined ||
    (Array.isArray(preserveQuery) && preserveQuery.every(isString))
  );
};

export function registerDefaultFunctions() {
  const { registerFunction } = useDefinedFunctions();
  const route = useDmsRoute();
  const { findMatchingRoute } = useSiteLayout();

  registerFunction(
    TableViewFunctions.CUSTOM_PAGE_FORM_SUCCESS,
    ({ params }: WatchAction) => {
      if (!isFormSuccessParams(params)) return;

      detach(
        navigateDms(
          resolveFormSuccessTarget(params, {
            query: route.query,
            params: findMatchingRoute(route.path)?.params,
          }),
        ),
      );
    },
  );
}
