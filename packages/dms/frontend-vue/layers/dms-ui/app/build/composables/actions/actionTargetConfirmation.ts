import type { ActionConfirm } from "#dms-core/app/types/confirm-dialog";
import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import type { ConfirmOptions } from "../../../composables/confirm/types";
import type {
  TargetHandlers,
  TargetsByKind,
  TargetRunExtras,
} from "./actionTargetTypes";
import type { createActionRequests } from "./actionTargetRequests";
import type { TargetRows } from "./actionTargetRows";
import type { useActionConfirm } from "../confirm/useActionConfirm";
import { targetUrl } from "./actionTargetUrl";

type ConfirmedRun = NonNullable<ConfirmOptions["onConfirm"]>;
type ConfirmedRuns = {
  [Kind in ActionTarget["type"]]?: (
    target: TargetsByKind[Kind],
    rowData?: Data,
    extras?: TargetRunExtras,
  ) => ConfirmedRun;
};

export function createActionTargetRunner(
  targetHandlers: TargetHandlers,
  requestApiTarget: ReturnType<typeof createActionRequests>["requestApiTarget"],
  confirmAction: ReturnType<typeof useActionConfirm>["confirmAction"],
  rowUrlParams: TargetRows["rowUrlParams"],
) {
  const confirmedRuns: ConfirmedRuns = {
    api: (target, rowData, extras) => (values) => {
      return requestApiTarget(
        target,
        targetUrl(target.url, rowData),
        rowData,
        values,
        extras?.selection,
      );
    },
  };
  return async <Kind extends ActionTarget["type"]>(
    target: TargetsByKind[Kind],
    label: string,
    rowData?: Data,
    declared?: ActionConfirm,
    extras?: TargetRunExtras,
  ) => {
    const handler = targetHandlers[target.type];
    if (!handler) return;
    if (!declared) {
      await handler(target, label, rowData, extras);
      return;
    }
    const runInside = confirmedRuns[target.type]?.(target, rowData, extras);
    const isConfirmed = await confirmAction(declared, {
      row: extras?.textParams ? { ...rowData, ...extras.textParams } : rowData,
      urlParams: rowUrlParams(rowData),
      run: runInside,
    });
    if (isConfirmed && !runInside) {
      await handler(target, label, rowData, extras);
    }
  };
}
