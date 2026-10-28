import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { Component } from "vue";
import { isString } from "#dms-core/app/utils/type-check";
import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import type { ActionTargetsConfig } from "./useActionTargets";
import type { RowTarget, SidePanelTarget } from "./actionTargetTypes";
import type { ShowRow } from "./rowNavigation";
import {
  clearWrittenRecord,
  resolveDeepLinkedRow,
  writeRecordId,
  type WrittenRecord,
} from "../table-view/utils/recordLink";
import { fillRowChildren, fillRowOptions } from "./rowComponentOptions";
import { resolveComponentChildren } from "../../../utils/componentTree";
import TargetComponentTree from "../../components/containers/TargetComponentTree.vue";
import { resolveConfirmText } from "../confirm/confirmDialogTexts";

const DEFAULT_ROW_ID_KEY = "_id";
const NO_ROW_ROUTE = async (): Promise<undefined> => undefined;
const NOT_FOUND_TITLE_KEY = "side_panel.not_found.title";
const NOT_FOUND_DESCRIPTION_KEY = "side_panel.not_found.description";

export const resolveTargetComponent = (componentName: string): Component =>
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The resolver still falls back to a string at runtime; Component erases that existing container mismatch and does not validate it.
  (resolveDmsComponent(componentName) || componentName) as Component;

export const targetComponentOf = (
  componentName: string,
  info: ComponentInfo,
): Component =>
  info.children?.length
    ? TargetComponentTree
    : resolveTargetComponent(componentName);

export function createTargetRows(config: ActionTargetsConfig) {
  const rowIdOf = (row?: Data): string | undefined => {
    if (!row) return undefined;
    const idKey =
      config.rowNavigation?.rowIdKey ?? config.rowIdKey ?? DEFAULT_ROW_ID_KEY;
    const id = get(row, idKey);
    return id === undefined || id === null ? undefined : String(id);
  };
  const recordRecorder = (deepLink?: boolean) => {
    let written: WrittenRecord | undefined;
    return (id?: string): void => {
      if (!deepLink || !config.recordScope || !config.rowNavigation) return;
      if (!id) {
        if (clearWrittenRecord(written)) config.onRecordShown?.(undefined);
        written = undefined;
        return;
      }
      written = writeRecordId(config.recordScope, id);
      config.onRecordShown?.(id);
    };
  };
  const rowShower = (
    show: (row: Data) => void,
    showMissing?: (id: string) => void,
  ): ShowRow => {
    let latest = 0;
    return async (rowOrId) => {
      const call = ++latest;
      if (!isString(rowOrId)) return show(rowOrId);
      const source = config.rowNavigation;
      const found = await resolveDeepLinkedRow(rowOrId, {
        listed: source?.rows(),
        idOf: rowIdOf,
        getRow: source?.getRow ?? NO_ROW_ROUTE,
      });
      if (call !== latest) return;
      if (found.row) return show(found.row);
      if (found.isMissing && showMissing) return showMissing(rowOrId);
      throw new Error(`The row "${rowOrId}" could not be read`);
    };
  };
  const targetOptionsFor = (
    target: ActionTarget,
    row?: Data,
  ): NonNullable<ComponentInfo["options"]> => {
    const componentTarget: ActionTarget &
      Partial<Pick<SidePanelTarget, "component">> = target;
    const { component } = componentTarget;
    const id = rowIdOf(row);
    const tokens = row && id !== undefined ? { ...row, id } : row;
    const declared = component?.options ?? {};
    const options = tokens ? fillRowOptions(declared, tokens) : declared;
    const children = component?.children;
    if (!component?.componentName || !children?.length) return options;
    const targetTree: ResolvedComponentInfo = {
      id: component.componentName,
      component: resolveTargetComponent(component.componentName),
      componentName: component.componentName,
      children: resolveComponentChildren(
        tokens ? fillRowChildren(children, tokens) : children,
      ),
    };
    return { ...options, targetTree };
  };
  const rowRecorder = (deepLink?: boolean) => {
    const recordId = recordRecorder(deepLink);
    return (row?: Data): void => recordId(rowIdOf(row));
  };
  const rowUrlParams = (rowData?: Data) => {
    const id = rowData
      ? get(rowData, config.rowIdKey ?? DEFAULT_ROW_ID_KEY)
      : undefined;
    return id === undefined || id === null ? undefined : { id };
  };
  return {
    rowIdOf,
    recordRecorder,
    rowShower,
    targetOptionsFor,
    rowRecorder,
    rowUrlParams,
  };
}

export type TargetRows = ReturnType<typeof createTargetRows>;

export function createRowTexts(
  processI18n: ReturnType<typeof useTranslation>["processI18n"],
  t: ReturnType<typeof useI18n>["t"],
) {
  const rowTitleOf = (target: RowTarget, row?: Data) =>
    row && target.rowTitle
      ? resolveConfirmText(target.rowTitle, row, t)
      : undefined;
  const notFoundOf = (target: RowTarget) => ({
    title: processI18n(target.notFound?.title || `$${NOT_FOUND_TITLE_KEY}`),
    description: processI18n(
      target.notFound?.description || `$${NOT_FOUND_DESCRIPTION_KEY}`,
    ),
  });
  return { rowTitleOf, notFoundOf };
}

export type RowTexts = ReturnType<typeof createRowTexts>;
