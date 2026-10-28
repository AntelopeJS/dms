import { isConfirmFrom } from "#dms-core/app/types/confirm-dialog";
import { namesRowField } from "#dms-core/app/utils/url-interpolation";
import type { CustomButton } from "../../../composables/table-view/types/custom-button";
import type { CustomRowAction } from "../../../types/row-action";
import type { ActionTargetsConfig } from "./useActionTargets";
import type { createActionTargetRunner } from "./actionTargetConfirmation";
import type { TargetRows } from "./actionTargetRows";
import {
  type BulkSelection,
  bulkSelectionQuery,
  isBulkAction,
  isUrlTarget,
  targetForRow,
  targetWithSelection,
  withQuery,
} from "./bulkSelection";
import {
  hasMissingRowState,
  isDeepLinkAction,
} from "../table-view/utils/recordLink";
import { dropRowTokens } from "../../utils/urlVariables";
import {
  handleComponentTarget,
  type ComponentTargetContext,
} from "./actionTargetContainers";
import type { createSidePanelHandler } from "./actionTargetSidePanel";

function rowRun(
  action: CustomRowAction,
  rowData: Data | undefined,
  rowIdOf: TargetRows["rowIdOf"],
) {
  const id = rowIdOf(rowData);
  if (!isBulkAction(action) || id === undefined) {
    return { target: action.target, confirm: action.confirm, row: rowData };
  }
  const selection: BulkSelection = { ids: [id], count: 1 };
  const query = bulkSelectionQuery(selection);
  const { confirm } = action;
  const textParams = { count: selection.count };
  return {
    target: targetForRow(action.target, query),
    textParams,
    selection: isUrlTarget(action.target) ? undefined : selection,
    row: isUrlTarget(action.target) ? { ...rowData, ...textParams } : rowData,
    confirm:
      confirm && isConfirmFrom(confirm) && !namesRowField(confirm.from)
        ? { from: withQuery(confirm.from, query) }
        : confirm,
  };
}

export function createCustomActions(
  handleActionTarget: ReturnType<typeof createActionTargetRunner>,
  rowIdOf: TargetRows["rowIdOf"],
  toast: ReturnType<typeof useToast>,
  processI18n: ReturnType<typeof useTranslation>["processI18n"],
) {
  const handleCustomButton = (button: CustomButton) => {
    if (button.disabled) {
      toast.add({
        color: Color.warning,
        title: processI18n(button.label),
        description: button.disabledReason
          ? processI18n(button.disabledReason)
          : undefined,
      });
      return;
    }
    void handleActionTarget(
      button.target,
      button.label,
      undefined,
      button.confirm,
    );
  };
  const handleCustomRowAction = (action: CustomRowAction, rowData?: Data) => {
    const { target, confirm, row, textParams, selection } = rowRun(
      action,
      rowData,
      rowIdOf,
    );
    void handleActionTarget(target, action.label, row, confirm, {
      deepLink: isDeepLinkAction(action),
      textParams,
      selection,
      keepsRow: !!selection,
    });
  };
  const handleBulkCustomAction = (
    action: CustomRowAction,
    selection: BulkSelection,
  ) => {
    const query = bulkSelectionQuery(selection);
    const declared =
      action.confirm && isConfirmFrom(action.confirm)
        ? { from: withQuery(dropRowTokens(action.confirm.from), query) }
        : action.confirm;
    void handleActionTarget(
      targetWithSelection(action.target, query),
      action.label,
      { count: selection.count },
      declared,
      { selection },
    );
  };
  return { handleCustomButton, handleCustomRowAction, handleBulkCustomAction };
}

export function createMissingRowHandler(
  config: ActionTargetsConfig,
  processI18n: ReturnType<typeof useTranslation>["processI18n"],
  componentContext: ComponentTargetContext,
  handleSidePanelTarget: ReturnType<typeof createSidePanelHandler>,
) {
  return (action: CustomRowAction, id: string) => {
    if (!hasMissingRowState(action)) return;
    if (action.target.type === "drawer") {
      handleComponentTarget(
        {
          target: action.target,
          title: processI18n(action.target.title || action.label),
          description: processI18n(action.target.description || ""),
          containerId: `${config.pageId}-${config.componentId}-${action.target.type}`,
          deepLink: isDeepLinkAction(action),
          missingId: id,
        },
        componentContext,
      );
      return;
    }
    if (action.target.type !== "sidePanel") return;
    handleSidePanelTarget({
      target: action.target,
      title: processI18n(action.target.title || action.label),
      containerId: `${config.pageId}-${config.componentId}-${action.target.type}`,
      deepLink: isDeepLinkAction(action),
      missingId: id,
    });
  };
}
