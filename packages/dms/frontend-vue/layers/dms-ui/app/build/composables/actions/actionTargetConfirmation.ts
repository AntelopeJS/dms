import type { ActionConfirm } from "#dms-core/app/types/confirm-dialog";
import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import type { ConfirmOptions } from "../../../composables/confirm/types";
import type { TargetHandlers, TargetRunExtras } from "./actionTargetTypes";
import type { createActionRequests } from "./actionTargetRequests";
import type { TargetRows } from "./actionTargetRows";
import type { useActionConfirm } from "../confirm/useActionConfirm";
import { targetUrl } from "./actionTargetUrl";

type ConfirmedRun = NonNullable<ConfirmOptions["onConfirm"]>;

function dispatchTarget(
  handlers: TargetHandlers,
  target: ActionTarget,
  label: string,
  rowData?: Data,
  extras?: TargetRunExtras,
) {
  switch (target.type) {
    case "page":
      return handlers.page(target, label, rowData, extras);
    case "external":
      return handlers.external(target, label, rowData, extras);
    case "api":
      return handlers.api(target, label, rowData, extras);
    case "exportJob":
      return handlers.exportJob(target, label, rowData, extras);
    case "download":
      return handlers.download(target, label, rowData, extras);
    case "modal":
      return handlers.modal(target, label, rowData, extras);
    case "quickAction":
      return handlers.quickAction(target, label, rowData, extras);
    case "drawer":
      return handlers.drawer(target, label, rowData, extras);
    case "sidePanel":
      return handlers.sidePanel(target, label, rowData, extras);
    default:
      return undefined;
  }
}

export function createActionTargetRunner(
  targetHandlers: TargetHandlers,
  requestApiTarget: ReturnType<typeof createActionRequests>["requestApiTarget"],
  confirmAction: ReturnType<typeof useActionConfirm>["confirmAction"],
  rowUrlParams: TargetRows["rowUrlParams"],
) {
  const confirmedRunOf = (
    target: ActionTarget,
    rowData?: Data,
    extras?: TargetRunExtras,
  ): ConfirmedRun | undefined =>
    target.type === "api"
      ? (values) =>
          requestApiTarget(
            target,
            targetUrl(target.url, rowData),
            rowData,
            values,
            extras?.selection,
          )
      : undefined;
  return async (
    target: ActionTarget,
    label: string,
    rowData?: Data,
    declared?: ActionConfirm,
    extras?: TargetRunExtras,
  ) => {
    if (!Object.hasOwn(targetHandlers, target.type)) return;
    if (!declared) {
      await dispatchTarget(targetHandlers, target, label, rowData, extras);
      return;
    }
    const runInside = confirmedRunOf(target, rowData, extras);
    const isConfirmed = await confirmAction(declared, {
      row: extras?.textParams ? { ...rowData, ...extras.textParams } : rowData,
      urlParams: rowUrlParams(rowData),
      run: runInside,
    });
    if (isConfirmed && !runInside) {
      await dispatchTarget(targetHandlers, target, label, rowData, extras);
    }
  };
}
