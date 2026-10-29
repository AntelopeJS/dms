import { useActiveElement } from "@vueuse/core";
import {
  QUICK_ACTION_BUTTON_KEY,
  QUICK_ACTION_COMPONENT_KEY,
  QUICK_ACTION_QUERY_KEY,
  type QuickActionIntent,
  readQuickActionIntent,
} from "../../../types/quick-actions";
import { registerQuickActionTarget } from "../../utils/quickActionTargets";
import { buildTableViewShortcuts } from "../../../composables/table-view/shortcuts";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewQuickActions<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "arrival" | "configuration" | "rowActions" | "rowOpen"
  >,
) {
  const { route } = scope.arrival;
  const { customButtons, componentId } = scope.configuration;
  const { handleCustomButton } = scope.rowActions;
  const { handleRowAdd } = scope.rowOpen;
  const router = useDmsRouter();

  async function clearQuickActionQuery() {
    const {
      [QUICK_ACTION_QUERY_KEY]: _discarded,
      [QUICK_ACTION_COMPONENT_KEY]: _discardedComponent,
      [QUICK_ACTION_BUTTON_KEY]: _discardedButton,
      ...rest
    } = route.query;
    await router.replace({ query: rest });
  }

  function pressCustomButton(id: string) {
    const button = customButtons?.find((candidate) => candidate.id === id);
    if (button) handleCustomButton(button);
  }

  function runQuickActionIntent(intent: QuickActionIntent) {
    switch (intent.kind) {
      case "add":
        handleRowAdd();
        break;
      case "button":
        pressCustomButton(intent.button);
        break;
    }
  }

  watch(
    [
      QUICK_ACTION_QUERY_KEY,
      QUICK_ACTION_COMPONENT_KEY,
      QUICK_ACTION_BUTTON_KEY,
    ].map((key) => () => route.query[key]),
    () => {
      const intent = readQuickActionIntent(route.query, componentId);
      if (!intent) return;

      if (import.meta.env.SSR) {
        void clearQuickActionQuery();
        return;
      }

      runQuickActionIntent(intent);
      void clearQuickActionQuery();
    },
    { immediate: true },
  );

  let unregisterQuickActionTarget: (() => void) | undefined;
  onMounted(() => {
    if (!componentId) return;
    unregisterQuickActionTarget = registerQuickActionTarget({
      path: route.path,
      componentId,
      run: runQuickActionIntent,
    });
  });
  onBeforeUnmount(() => unregisterQuickActionTarget?.());
  return { router };
}

export function useTableViewShortcuts<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "refresh"
    | "configuration"
    | "rowActions"
    | "queryFilters"
    | "filterState"
    | "urlFilters"
    | "listState"
  >,
) {
  const { refreshByUser } = scope.refresh;
  const { tableProps } = scope.configuration;
  const { newRow } = scope.rowActions;
  const { queryParamDefaults } = scope.queryFilters;
  const { globalFilter } = scope.filterState;
  const { rowSelect } = scope.urlFilters;
  const { shownData } = scope.listState;
  defineShortcuts(
    buildTableViewShortcuts({
      refresh: refreshByUser,
      tableProps,
      newRow: () => newRow(queryParamDefaults.value),
      globalFilter,
      rowSelect,
      data: shownData,
      activeElement: useActiveElement(),
    }),
  );
  return {};
}
