import type { Component } from "vue";
import type {
  ContainerInstance,
  DrawerOptions,
} from "../../../composables/containers/types";
import type { RowNavigation } from "../../../types/row-navigation";
import DmsRowHeader from "../../components/containers/row/RowHeader.vue";
import DmsRowNotFound from "../../components/containers/row/RowNotFound.vue";
import { drawerRowHeaderProps } from "../../components/containers/row/drawerRowHeader";
import { dmsOwnDrawer } from "../containers/context";
import { listenRowSteps, trackRowNavigation } from "./rowNavigation";
import {
  targetComponentOf,
  type TargetRows,
  type RowTexts,
} from "./actionTargetRows";
import type { ActionTargetsConfig } from "./useActionTargets";
import type { ComponentTargetRun } from "./actionTargetTypes";

export function createContainerOpener(
  config: ActionTargetsConfig,
  openModal: ReturnType<typeof useModal>["open"],
  openDrawer: ReturnType<typeof useDrawer>["open"],
) {
  return (
    run: ComponentTargetRun,
    component: Component,
    options: Pick<
      DrawerOptions,
      "title" | "componentOptions" | "headerComponentOptions"
    >,
  ): ContainerInstance => {
    const containerOptions = {
      ...options,
      description: run.description,
      containerId: run.containerId,
      component,
    };
    if (run.target.type === "modal") {
      return openModal({ ...containerOptions, size: run.target.size });
    }
    return openDrawer(
      dmsOwnDrawer({
        ...containerOptions,
        direction: run.target.direction,
        size: run.target.size,
        sizeKey: `${config.pageId}-${config.componentId}-${run.target.component?.componentName}`,
        ...(options.headerComponentOptions && {
          headerComponent: DmsRowHeader,
        }),
      }),
    );
  };
}

export interface ComponentTargetContext {
  config: ActionTargetsConfig;
  rows: TargetRows;
  texts: RowTexts;
  openContainer: ReturnType<typeof createContainerOpener>;
}

function hasRowHeader(target: ComponentTargetRun["target"]): boolean {
  if (target.type !== "drawer") return false;
  return target.rowHeader ?? !!(target.rowTitle || target.positionLabel);
}

export function handleComponentTarget(
  run: ComponentTargetRun,
  context: ComponentTargetContext,
) {
  const { config, rows, texts, openContainer } = context;
  const { targetOptionsFor, rowShower, rowIdOf, rowRecorder } = rows;
  const { rowTitleOf } = texts;
  const componentName = run.target.component?.componentName;
  if (!componentName) return;
  if (run.missingId) return showMissingInDrawer(run, run.missingId, context);
  const component = targetComponentOf(componentName, run.target.component);
  const source = config.rowNavigation;
  const drawerTarget = run.target.type === "drawer" ? run.target : undefined;
  const withRowHeader = hasRowHeader(run.target) && !run.selection;
  let instance: ContainerInstance | undefined;
  let navigation: RowNavigation | undefined;
  let stopNavigation: (() => void) | undefined;
  let closed = false;
  const showRowOpen = (row: Data) => {
    if (!closed) showRow(row);
  };
  const showRowById = rowShower(showRowOpen);
  const trackNavigation = (row?: Data) => {
    stopNavigation?.();
    stopNavigation = undefined;
    navigation = undefined;
    if (!row || !source) return;
    let isShowing = true;
    stopNavigation = trackRowNavigation(source, row, showRowOpen, (next) => {
      navigation = next;
      if (isShowing || !instance || closed) return;
      instance.patch({
        componentOptions: optionsOf(row),
        ...(withRowHeader && { headerComponentOptions: headerFor(row) }),
      });
    });
    isShowing = false;
  };
  const optionsFor = (row?: Data) => {
    trackNavigation(row);
    return optionsOf(row);
  };
  const optionsOf = (row?: Data) => ({
    ...targetOptionsFor(run.target, row),
    pageId: config.pageId,
    componentId: config.componentId,
    containerId: run.containerId,
    rowData: row,
    navigation,
    showRow: showRowById,
    selection: run.selection,
    onSuccessCallback: () => {
      instance?.close();
      config.refreshCallback?.();
    },
  });
  const titleFor = (row?: Data) =>
    (drawerTarget && rowTitleOf(drawerTarget, row)) || run.title;
  const headerFor = (row?: Data) =>
    withRowHeader
      ? drawerRowHeaderProps(
          { positionLabel: drawerTarget?.positionLabel, navigation },
          titleFor(row),
        )
      : undefined;
  const recordRow = rowRecorder(run.deepLink);
  function showRow(row: Data) {
    const componentOptions = optionsFor(row);
    instance?.patch({
      title: titleFor(row),
      componentOptions,
      componentKey: rowIdOf(row),
      ...(withRowHeader && { headerComponentOptions: headerFor(row) }),
    });
    recordRow(row);
  }
  const componentOptions = optionsFor(run.rowData);
  instance = openContainer(run, component, {
    title: titleFor(run.rowData),
    componentOptions,
    headerComponentOptions: headerFor(run.rowData),
  });
  recordRow(run.rowData);
  const stopSteps = source ? listenRowSteps(() => navigation) : undefined;
  const settle = () => {
    closed = true;
    stopSteps?.();
    stopNavigation?.();
    recordRow(undefined);
  };
  instance.result.then(settle, settle);
}

function showMissingInDrawer(
  run: ComponentTargetRun,
  id: string,
  context: ComponentTargetContext,
): void {
  if (run.target.type !== "drawer") return;
  const { rows, texts, openContainer } = context;
  const recordId = rows.recordRecorder(run.deepLink);
  let instance: ContainerInstance | undefined;
  const notFound = texts.notFoundOf(run.target);
  instance = openContainer(run, DmsRowNotFound, {
    title: run.title,
    componentOptions: { ...notFound, onClose: () => instance?.close() },
  });
  recordId(id);
  const settle = () => recordId(undefined);
  instance.result.then(settle, settle);
}
