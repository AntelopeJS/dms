import type { LocationQueryValue } from "#dms/frontend-module";
import { replaceUrlVariables } from "../../../composables/form/useForm";

type RouteQuery = Record<string, LocationQueryValue | LocationQueryValue[]>;

export interface FormSuccessParams {
  url: string;
  preserveQuery?: string[];
}

export interface FormSuccessRoute {
  query: RouteQuery;
  params?: Record<string, string>;
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
): { path: string; query?: RouteQuery } {
  const path = replaceUrlVariables(url, {
    routeParams: route.params,
    routeQuery: route.query,
  });

  // Restore the filtered table view: carry back the query params the form
  // was opened with (those declared in `queryParamFilters`).
  const query: RouteQuery = {};
  for (const key of preserveQuery ?? []) {
    if (route.query[key] !== undefined) {
      query[key] = route.query[key];
    }
  }

  return { path, ...(Object.keys(query).length > 0 ? { query } : {}) };
}

export function registerDefaultFunctions() {
  const { registerFunction } = useDefinedFunctions();
  const route = useDmsRoute();
  const { findMatchingRoute } = useSiteLayout();

  registerFunction(
    TableViewFunctions.CUSTOM_PAGE_FORM_SUCCESS,
    (event: CustomEvent) => {
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
