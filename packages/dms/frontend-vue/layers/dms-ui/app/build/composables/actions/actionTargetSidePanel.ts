import { getCurrentScope, onScopeDispose } from "vue";
import {
  closeRowSidePanel,
  closeRowSidePanelOf,
  openRowSidePanel,
  rowSidePanelOwnerKey,
  useRowSidePanelContent,
} from "#dms-layout/app/build/composables/layout/rowSidePanel";
import type { ActionTargetsConfig } from "./useActionTargets";
import type { SidePanelTargetRun } from "./actionTargetTypes";
import {
  targetComponentOf,
  type TargetRows,
  type RowTexts,
} from "./actionTargetRows";

function whileShown<V>(session: symbol, show: (value: V) => void) {
  return (value: V): void => {
    if (useRowSidePanelContent().value?.session === session) show(value);
  };
}

export function createSidePanelHandler(
  config: ActionTargetsConfig,
  rows: TargetRows,
  texts: RowTexts,
) {
  const { recordRecorder, rowShower, targetOptionsFor, rowIdOf } = rows;
  const { rowTitleOf, notFoundOf } = texts;
  const ownerKey = rowSidePanelOwnerKey(config.pageId, config.componentId);
  if (getCurrentScope()) onScopeDispose(() => closeRowSidePanelOf(ownerKey));
  return (run: SidePanelTargetRun) => {
    const componentName = run.target.component?.componentName;
    if (!componentName) return;
    const session = Symbol(componentName);
    const recordId = recordRecorder(
      run.deepLink && (!run.selection || run.keepsRow),
    );
    const panel = {
      session,
      ownerKey,
      title: run.title,
      positionLabel: run.target.positionLabel,
      component: targetComponentOf(componentName, run.target.component),
      componentOptions: {
        pageId: config.pageId,
        componentId: config.componentId,
        containerId: run.containerId,
        selection: run.selection,
        showRow: rowShower(
          whileShown(session, showRow),
          whileShown(session, showMissing),
        ),
        onSuccessCallback: () => {
          closeRowSidePanel(session);
          config.refreshCallback?.();
        },
      },
      onClose: () => recordId(undefined),
    };
    function showRow(row?: Data) {
      openRowSidePanel({
        ...panel,
        componentOptions: {
          ...targetOptionsFor(run.target, row),
          ...panel.componentOptions,
        },
        rowTitle: rowTitleOf(run.target, row),
        row,
        rowKey: rowIdOf(row),
        source: row ? config.rowNavigation : undefined,
        showRow: whileShown(session, showRow),
      });
      recordId(rowIdOf(row));
    }
    function showMissing(id: string) {
      openRowSidePanel({
        ...panel,
        componentOptions: {
          ...targetOptionsFor(run.target),
          ...panel.componentOptions,
        },
        notFound: notFoundOf(run.target),
        showRow,
      });
      recordId(id);
    }
    if (run.missingId) return showMissing(run.missingId);
    showRow(run.rowData);
  };
}
