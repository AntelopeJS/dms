import type { LocationQueryValue } from "#dms/frontend-module";
import { resolveLinkVariables } from "../../utils/urlVariables";

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

export function registerDefaultFunctions() {
  const { registerFunction } = useDefinedFunctions();
  const route = useDmsRoute();
  const { findMatchingRoute } = useSiteLayout();

  registerFunction(
    TableViewFunctions.CUSTOM_PAGE_FORM_SUCCESS,
    (event: CustomEvent) => {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- CustomEvent does not declare the function registry's params extension. Its owner supplies no typed event contract; validation would change malformed-event behavior.
      const { params } = event as CustomEvent & { params: FormSuccessParams };

      navigateDms(
        resolveFormSuccessTarget(params, {
          query: route.query,
          params: findMatchingRoute(route.path)?.params,
        }),
      );
    },
  );
}
