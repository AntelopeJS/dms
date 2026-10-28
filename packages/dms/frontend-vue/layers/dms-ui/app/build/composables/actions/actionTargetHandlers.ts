import type { ActionTargetsConfig } from "./useActionTargets";
import type { TargetHandler, TargetHandlers } from "./actionTargetTypes";
import type {
  createActionRequests,
  createExportJobHandler,
} from "./actionTargetRequests";
import {
  handleComponentTarget,
  type ComponentTargetContext,
} from "./actionTargetContainers";
import type { createSidePanelHandler } from "./actionTargetSidePanel";
import { targetUrl } from "./actionTargetUrl";
import {
  dispatchQuickActionTarget,
  findServedQuickAction,
} from "../../utils/dispatchQuickActionTarget";

interface TargetHandlerContext {
  config: ActionTargetsConfig;
  processI18n: ReturnType<typeof useTranslation>["processI18n"];
  componentContext: ComponentTargetContext;
  handleSidePanelTarget: ReturnType<typeof createSidePanelHandler>;
  requests: ReturnType<typeof createActionRequests>;
  handleExportJobTarget: ReturnType<typeof createExportJobHandler>;
}

export function createTargetHandlers(
  context: TargetHandlerContext,
): TargetHandlers {
  const {
    config,
    processI18n,
    componentContext,
    handleSidePanelTarget,
    requests,
    handleExportJobTarget,
  } = context;
  const { handleApiTarget, handleDownloadTarget } = requests;
  const componentHandler: TargetHandler<"modal" | "drawer"> = (
    target,
    label,
    rowData,
    extras,
  ) =>
    handleComponentTarget(
      {
        target,
        title: processI18n(target.title || label),
        description: processI18n(target.description || ""),
        containerId: `${config.pageId}-${config.componentId}-${target.type}`,
        rowData: extras?.selection && !extras.keepsRow ? undefined : rowData,
        ...extras,
      },
      componentContext,
    );
  const sidePanelHandler: TargetHandler<"sidePanel"> = (
    target,
    label,
    rowData,
    extras,
  ) =>
    handleSidePanelTarget({
      target,
      title: processI18n(target.title || label),
      containerId: `${config.pageId}-${config.componentId}-${target.type}`,
      rowData: extras?.selection && !extras.keepsRow ? undefined : rowData,
      ...extras,
    });
  return {
    page: (target, _label, rowData) => {
      navigateDms(targetUrl(target.url, rowData));
    },
    external: (target, _label, rowData) => {
      const url = targetUrl(target.url, rowData);
      if (typeof window === "undefined" || !url) return;
      if (target.newTab) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      window.location.href = url;
    },
    api: async (target, label, rowData, extras) => {
      const url = targetUrl(target.url, rowData);
      await handleApiTarget(target, url, label, rowData, extras?.selection);
    },
    exportJob: async (target, _label, rowData) => {
      const url = targetUrl(target.url, rowData);
      await handleExportJobTarget(target, url, rowData);
    },
    download: (target, label, rowData) =>
      handleDownloadTarget(target, label, rowData),
    modal: componentHandler,
    quickAction: (target) => {
      const { id } = target;
      const quickAction = findServedQuickAction(
        useSiteLayout().quickActions.value?.actions,
        id,
      );
      if (quickAction) dispatchQuickActionTarget(quickAction.target);
    },
    drawer: componentHandler,
    sidePanel: sidePanelHandler,
  };
}
