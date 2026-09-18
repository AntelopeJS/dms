import type { LocationQueryValue } from "#dms/frontend-module";

export function registerDefaultFunctions() {
  const { registerFunction } = useDefinedFunctions();
  const route = useDmsRoute();

  registerFunction(
    TableViewFunctions.CUSTOM_PAGE_FORM_SUCCESS,
    (event: CustomEvent) => {
      const { url, preserveQuery } = (
        event as CustomEvent & {
          params: { url: string; preserveQuery?: string[] };
        }
      ).params;

      // Restore the filtered table view: carry back the query params the form
      // was opened with (those declared in `queryParamFilters`).
      const query: Record<string, LocationQueryValue | LocationQueryValue[]> =
        {};
      for (const key of preserveQuery ?? []) {
        if (route.query[key] !== undefined) {
          query[key] = route.query[key];
        }
      }

      navigateDms({
        path: url,
        ...(Object.keys(query).length > 0 ? { query } : {}),
      });
    },
  );
}
