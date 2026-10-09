import { isConfirmFrom } from "#dms-core/app/types/confirm-dialog";
import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import type { CustomRowAction } from "../../../types/row-action";
import type { RecordAction, RecordData } from "../../../types/record-action";
import { refreshPageBlocks } from "../../../utils/blockRefresh";
import {
  type ReplaceUrlVariablesContext,
  replaceUrlVariables,
} from "../../utils/urlVariables";
import { useActionTargets } from "./useActionTargets";

/** Where the actions of a record run. */
export interface RecordActionsConfig {
  /** Ids the drawers and modals the actions open are keyed by. */
  pageId: string;
  componentId: string;
  /** The parameters of the page route, filling `{{params.X}}`. */
  routeParams: () => Record<string, string> | undefined;
}

// The fields of a target naming a URL, in every kind that has one.
const TARGET_URL_KEYS = ["url", "statusUrl", "downloadUrl"] as const;

/**
 * The action with `{{params.X}}` and `{{query.X}}` filled in its target's
 * URLs and its confirmation's `from`, from the page URL: the record's own
 * `{field}` placeholders are filled when it runs.
 */
export function withRouteTokens<A extends RecordAction>(
  action: A,
  context: ReplaceUrlVariablesContext,
): A {
  const target: Record<string, unknown> = { ...action.target };
  for (const key of TARGET_URL_KEYS) {
    const url = target[key];
    if (typeof url === "string")
      target[key] = replaceUrlVariables(url, context);
  }
  const { confirm } = action;
  return {
    ...action,
    target: target as ActionTarget,
    confirm:
      confirm && isConfirmFrom(confirm)
        ? { from: replaceUrlVariables(confirm.from, context) }
        : confirm,
  };
}

/**
 * Runs the actions of the record a page shows (a page header's buttons, an
 * `ActionList`'s rows) as a table runs its buttons — confirmation, drawer,
 * modal, API call, export, link — on the record: its fields fill the
 * target's `{field}` placeholders and the confirmation's texts, and a drawer
 * or modal receives it as its row. Once an action changed something, every
 * data block of the page reads its data again, the record included.
 */
export function useRecordActions(config: RecordActionsConfig) {
  const route = useDmsRoute();
  const { $authFetch } = useAuthFetch();
  const { handleCustomButton, handleCustomRowAction } = useActionTargets({
    api: $authFetch,
    componentId: config.componentId,
    pageId: config.pageId,
    refreshCallback: refreshPageBlocks,
    handleApiError: (error, title) => useApiError(error, { title }),
  });

  const urlContext = (): ReplaceUrlVariablesContext => ({
    routeParams: config.routeParams(),
    routeQuery: route.query as Record<string, unknown>,
  });

  /** Runs `action`, on `record` when the page has one. */
  const runRecordAction = (
    action: RecordAction,
    record?: RecordData | null,
  ): void => {
    const resolved = withRouteTokens(action, urlContext());
    // A disabled action is reached through a quick action pressing it by id:
    // the button path tells its reason instead of running it.
    if (record && !resolved.disabled) {
      handleCustomRowAction(resolved as CustomRowAction, record);
      return;
    }
    handleCustomButton(resolved);
  };

  return { runRecordAction, urlContext };
}
