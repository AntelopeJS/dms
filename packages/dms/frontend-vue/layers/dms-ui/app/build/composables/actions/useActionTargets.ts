import { useClipboard } from "@vueuse/core";
import {
  type ActionConfirm,
  isConfirmFrom,
} from "#dms-core/app/types/confirm-dialog";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import { type Component, getCurrentScope, onScopeDispose } from "vue";
import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import type { CustomButton } from "../../../composables/table-view/types/custom-button";
import type { CustomRowAction } from "../../../types/row-action";
import type {
  ConfirmOptions,
  ConfirmValues,
} from "../../../composables/confirm/types";
import { resolveResponseToast } from "../../utils/responseWarning";
import type { ContainerInstance } from "../../../composables/containers/types";
import {
  type BulkSelection,
  bulkSelectionQuery,
  targetWithSelection,
  withQuery,
} from "./bulkSelection";
import {
  listenRowSteps,
  type RowNavigation,
  type RowNavigationSource,
  rowNavigation,
  type ShowRow,
} from "./rowNavigation";
import {
  clearWrittenRecord,
  isDeepLinkAction,
  resolveDeepLinkedRow,
  writeRecordId,
  type WrittenRecord,
} from "../table-view/utils/recordLink";
import {
  closeRowSidePanel,
  closeRowSidePanelOf,
  openRowSidePanel,
  rowSidePanelOwnerKey,
  useRowSidePanelContent,
} from "#dms-layout/app/build/composables/layout/rowSidePanel";
import type { TableUrlScope } from "../table-view/utils/views";
import { useActionConfirm } from "../confirm/useActionConfirm";
import {
  type ConfirmTranslate,
  resolveConfirmText,
} from "../confirm/confirmDialogTexts";
import {
  dispatchQuickActionTarget,
  findServedQuickAction,
} from "../../utils/dispatchQuickActionTarget";
import {
  namesPageValue,
  resolveLinkVariables,
  resolveTextVariables,
} from "../../utils/urlVariables";
import { currentPageUrlValues } from "../page/pageUrlValues";
import { type DownloadFetch, saveDownload } from "../../utils/fileDownload";
import { interpolateRowText } from "#dms-core/app/utils/url-interpolation";

/** Runs a confirmed action from inside its dialog (see `onConfirm`). */
type ConfirmedRun = NonNullable<ConfirmOptions["onConfirm"]>;

/**
 * A target's URL with the page's `{{params.X}}` / `{{query.X}}` filled (a
 * query pair without a value left out), then the row's `{{row.field}}`: an
 * action keeps the page's context (`?website={{query.website}}`) as a page
 * header button does, whatever its type and wherever it sits. Read when the
 * action runs, so it carries the URL as it is then.
 */
function targetUrl(url: string, rowData?: Data): string {
  const withPageValues = namesPageValue(url)
    ? resolveLinkVariables(url, currentPageUrlValues())
    : url;
  return rowData ? interpolateUrl(withPageValues, rowData) : withPageValues;
}

/**
 * A download target's file name with the row's `{{row.field}}` and the
 * page's tokens filled as they are (a name, not a URL: nothing is encoded). A
 * token without a value leaves no name: the server's one is used.
 */
function downloadTargetFilename(
  filename: string | undefined,
  rowData?: Data,
): string | undefined {
  if (!filename) return undefined;
  const withRow = rowData ? interpolateRowText(filename, rowData) : filename;
  return resolveTextVariables(withRow, currentPageUrlValues());
}

// The id an export job's start answered, in its `statusUrl` / `downloadUrl`.
const JOB_ID_TOKEN = /\{\{\s*job\.id\s*\}\}/g;

/** Where the buttons run: the requests they send, what they refresh. */
export interface ActionTargetsConfig {
  api: ReturnType<typeof $fetch.create>;
  /** Ids the drawers and modals the targets open are keyed by. */
  pageId: string;
  componentId: string;
  /** Called once a target changed something (an API call, a closed form). */
  refreshCallback?: () => void;
  /** Toasts a failure no dialog shows. */
  handleApiError: (error: unknown, title?: string) => void;
  /** The rows a drawer or modal opened on a row steps through (J / K). */
  rowNavigation?: RowNavigationSource;
  /** Where a `deepLink` action writes the row it has open in the URL. */
  recordScope?: TableUrlScope;
  /**
   * Told the row a `deepLink` action shows each time it writes it in the URL,
   * and `undefined` once its container closed and removed it.
   */
  onRecordShown?: (id?: string) => void;
  /**
   * The field a row's id is read from (`_id` by default): it fills `{{row.id}}` in
   * the `from` URL of a row action's confirmation, as on a built-in action.
   */
  rowIdKey?: string;
}

const DEFAULT_ROW_ID_KEY = "_id";

/** How a target runs beyond its row. */
interface TargetRunExtras {
  /** The rows of a bulk action, handed to a drawer or modal. */
  selection?: BulkSelection;
  /** The open row is reflected in the URL. */
  deepLink?: boolean;
}

type SidePanelTarget = ActionTarget & { type: "sidePanel" };
type DownloadTarget = ActionTarget & { type: "download" };

/** A side panel to open, and on what. */
interface SidePanelTargetRun extends TargetRunExtras {
  target: SidePanelTarget;
  title: string;
  containerId: string;
  rowData?: Data;
  /** Id of a row the link names but the route answered 404 for. */
  missingId?: string;
}

/**
 * `show`, run only while the row side panel still shows `session`: a row read
 * after the panel closed, or moved to another run, leaves it alone.
 */
function whileShown<V>(session: symbol, show: (value: V) => void) {
  return (value: V): void => {
    if (useRowSidePanelContent().value?.session === session) show(value);
  };
}

const NO_ROW_ROUTE = async (): Promise<undefined> => undefined;

const NOT_FOUND_TITLE_KEY = "side_panel.not_found.title";
const NOT_FOUND_DESCRIPTION_KEY = "side_panel.not_found.description";

/** A drawer or modal to open, and on what. */
interface ComponentTargetRun extends TargetRunExtras {
  target: ActionTarget & { type: "modal" | "drawer" };
  title: string;
  description: string;
  containerId: string;
  rowData?: Data;
}

/**
 * Runs the target of a button or a row action (`ActionTarget`), after the
 * confirmation the action declares: a table's toolbar buttons and row
 * actions, and the buttons of a page header.
 */
export function useActionTargets(config: ActionTargetsConfig) {
  const toast = useToast();
  const { processI18n, processApiMessage } = useTranslation();
  const { t } = useI18n();
  const { open: openModal } = useModal();
  const { open: openDrawer } = useDrawer();
  const { runJob: runExportJob } = useExportJob();
  const { copy: copyToClipboard } = useClipboard({ legacy: true });
  const { confirmAction } = useActionConfirm();
  const { handleApiError } = config;
  const fetchRaw = useAuthFetch().$authFetch.raw as unknown as DownloadFetch;

  /** Calls an `api` target and tells how it went (rejects on a failure). */
  const requestApiTarget = async (
    target: ActionTarget & { type: "api" },
    url: string,
    rowData?: Data,
    values: ConfirmValues = {},
  ) => {
    // The confirmation's values join the declared body, the input winning.
    const body = { ...target.body, ...values };
    const response = await config.api<Record<string, unknown> | undefined>(
      url,
      {
        method: target.method || HttpMethod.post,
        ...(Object.keys(body).length > 0 ? { body } : {}),
      },
    );
    if (target.copy) {
      await copyToClipboard(String(response?.[target.copy] ?? ""));
    }
    toast.add(
      resolveResponseToast(
        response,
        {
          color: Color.success,
          // Pluralized on a bulk action's `{ count }`, like its dialog.
          title: resolveConfirmText(
            target.successMessage,
            rowData ?? {},
            t as ConfirmTranslate,
          ),
        },
        { processI18n, processApiMessage },
      ),
    );
    // A read-only call (a link to copy) changes no row.
    if (target.method !== "GET") config.refreshCallback?.();
  };

  // A direct call toasts a refusal; a confirmed one runs inside its dialog
  // (see `confirmedRuns`).
  const handleApiTarget = async (
    target: ActionTarget & { type: "api" },
    url: string,
    label: string,
    rowData?: Data,
  ) => {
    try {
      await requestApiTarget(target, url, rowData);
    } catch (error: unknown) {
      handleApiError(error, label ? processI18n(label, rowData) : undefined);
    }
  };

  const handleExportJobTarget = async (
    target: ActionTarget & { type: "exportJob" },
    url: string,
    rowData?: Data,
  ) => {
    const labels = target.labels
      ? {
          title: target.labels.title
            ? processI18n(target.labels.title)
            : undefined,
          exporting: target.labels.exporting
            ? processI18n(target.labels.exporting)
            : undefined,
          downloading: target.labels.downloading
            ? processI18n(target.labels.downloading)
            : undefined,
          successTitle: target.labels.successTitle
            ? processI18n(target.labels.successTitle)
            : undefined,
          successMessage: target.labels.successMessage
            ? processI18n(target.labels.successMessage)
            : undefined,
          errorTitle: target.labels.errorTitle
            ? processI18n(target.labels.errorTitle)
            : undefined,
          retry: target.labels.retry
            ? processI18n(target.labels.retry)
            : undefined,
        }
      : undefined;
    const statusUrlTemplate = target.statusUrl;
    const downloadUrlTemplate = target.downloadUrl;
    const interpolate = (template: string, ticket: ExportJobTicket): string =>
      targetUrl(
        template.replace(JOB_ID_TOKEN, encodeURIComponent(ticket.jobId)),
        rowData,
      );
    await runExportJob({
      startUrl: url,
      startMethod: target.method ?? "POST",
      statusUrl: statusUrlTemplate
        ? (ticket) => interpolate(statusUrlTemplate, ticket)
        : undefined,
      downloadUrl: downloadUrlTemplate
        ? (ticket) => interpolate(downloadUrlTemplate, ticket)
        : undefined,
      labels,
    });
  };

  // Fetched with the user's session, as a confirmation's download is; a
  // refusal is toasted like a failed API call.
  const handleDownloadTarget = async (
    target: DownloadTarget,
    label: string,
    rowData?: Data,
  ) => {
    try {
      await saveDownload(
        {
          url: targetUrl(target.url, rowData),
          filename: downloadTargetFilename(target.filename, rowData),
        },
        fetchRaw,
      );
    } catch (error: unknown) {
      handleApiError(error, label ? processI18n(label, rowData) : undefined);
    }
  };

  const openContainer = (
    run: ComponentTargetRun,
    component: Component,
    componentOptions: Record<string, unknown>,
  ): ContainerInstance => {
    const options = {
      title: run.title,
      description: run.description,
      containerId: run.containerId,
      component,
      componentOptions,
    };
    return run.target.type === "modal"
      ? openModal({ ...options, size: run.target.size })
      : openDrawer({ ...options, direction: run.target.direction });
  };

  const resolveTargetComponent = (componentName: string): Component =>
    (resolveDmsComponent(componentName) || componentName) as Component;

  const rowIdOf = (row?: Data): string | undefined => {
    if (!row) return undefined;
    const idKey =
      config.rowNavigation?.rowIdKey ?? config.rowIdKey ?? DEFAULT_ROW_ID_KEY;
    const id = get(row, idKey);
    return id === undefined || id === null ? undefined : String(id);
  };

  // A deep-linked action keeps the row it has open in the URL, by id;
  // `undefined` removes it, but only the row this run wrote, on the page it
  // wrote it: closing as the user navigates leaves the next page's
  // `?record=` alone.
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
  // `showRow` given an id: the listed row, else the one the table's route
  // reads. A row its route answered 404 for goes to `showMissing` when the
  // container has a state for it; any other row not found rejects. Only the
  // latest call applies: a read that resolves after a later call is dropped.
  const rowShower = (
    show: (row: Data) => void,
    showMissing?: (id: string) => void,
  ): ShowRow => {
    let latest = 0;
    return async (rowOrId) => {
      const call = ++latest;
      if (typeof rowOrId !== "string") return show(rowOrId);
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

  const rowRecorder = (deepLink?: boolean) => {
    const recordId = recordRecorder(deepLink);
    return (row?: Data): void => recordId(rowIdOf(row));
  };

  // The header names the open row when the target words it from its fields.
  const rowTitleOf = (target: SidePanelTarget, row?: Data) =>
    row && target.rowTitle
      ? resolveConfirmText(target.rowTitle, row, t as ConfirmTranslate)
      : undefined;

  const notFoundOf = (target: SidePanelTarget) => ({
    title: processI18n(target.notFound?.title || `$${NOT_FOUND_TITLE_KEY}`),
    description: processI18n(
      target.notFound?.description || `$${NOT_FOUND_DESCRIPTION_KEY}`,
    ),
  });

  const ownerKey = rowSidePanelOwnerKey(config.pageId, config.componentId);

  // The panel belongs to the table that opened it: it closes with it.
  if (getCurrentScope()) onScopeDispose(() => closeRowSidePanelOf(ownerKey));

  // A side panel opened on a listed row steps through the rows shown in place
  // (the panel computes its position); a deep-linked one keeps the row in the
  // URL while it is open. A bulk action's panel receives the selection.
  const handleSidePanelTarget = (run: SidePanelTargetRun) => {
    const componentName = run.target.component?.componentName;
    if (!componentName) return;
    const session = Symbol(componentName);
    const recordId = recordRecorder(run.deepLink && !run.selection);
    const panel = {
      session,
      ownerKey,
      title: run.title,
      positionLabel: run.target.positionLabel,
      component: resolveTargetComponent(componentName),
      componentOptions: {
        ...run.target.component?.options,
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
        rowTitle: rowTitleOf(run.target, row),
        row,
        rowKey: rowIdOf(row),
        source: row ? config.rowNavigation : undefined,
        showRow,
      });
      recordId(rowIdOf(row));
    }
    function showMissing(id: string) {
      openRowSidePanel({ ...panel, notFound: notFoundOf(run.target), showRow });
      recordId(id);
    }
    if (run.missingId) return showMissing(run.missingId);
    showRow(run.rowData);
  };

  // A container opened on a listed row steps through the rows shown (its
  // `navigation` prop, J and K), mounting its component anew on each; a
  // deep-linked one keeps the row in the URL while it is open.
  const handleComponentTarget = (run: ComponentTargetRun) => {
    const componentName = run.target.component?.componentName;
    if (!componentName) return;
    const component = resolveTargetComponent(componentName);
    const source = config.rowNavigation;
    let instance: ContainerInstance | undefined;
    let navigation: RowNavigation | undefined;
    // Set once the container closes: a row read that resolves later neither
    // writes `?record=` back nor patches the closed container.
    let closed = false;
    const showRowById = rowShower((row) => {
      if (!closed) showRow(row);
    });
    const optionsFor = (row?: Data) => {
      navigation =
        row && source ? rowNavigation(source, row, showRow) : undefined;
      return {
        ...run.target.component?.options,
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
      };
    };
    const recordRow = rowRecorder(run.deepLink);
    function showRow(row: Data) {
      instance?.patch({
        componentOptions: optionsFor(row),
        componentKey: rowIdOf(row),
      });
      recordRow(row);
    }
    instance = openContainer(run, component, optionsFor(run.rowData));
    recordRow(run.rowData);
    // `showRow` may move an unlisted row's container onto a listed one.
    const stopSteps = source ? listenRowSteps(() => navigation) : undefined;
    const settle = () => {
      closed = true;
      stopSteps?.();
      recordRow(undefined);
    };
    instance.result.then(settle, settle);
  };

  type TargetHandler = (
    target: ActionTarget,
    label: string,
    rowData?: Data,
    extras?: TargetRunExtras,
  ) => Promise<void> | void;

  // A drawer or modal: a bulk action hands it the selection, not a row.
  const componentHandler: TargetHandler = (target, label, rowData, extras) =>
    handleComponentTarget({
      target: target as ActionTarget & { type: "modal" | "drawer" },
      title: processI18n((target as { title?: string }).title || label),
      description: processI18n(
        (target as { description?: string }).description || "",
      ),
      containerId: `${config.pageId}-${config.componentId}-${target.type}`,
      rowData: extras?.selection ? undefined : rowData,
      ...extras,
    });

  const sidePanelHandler: TargetHandler = (target, label, rowData, extras) =>
    handleSidePanelTarget({
      target: target as SidePanelTarget,
      title: processI18n((target as SidePanelTarget).title || label),
      containerId: `${config.pageId}-${config.componentId}-${target.type}`,
      rowData: extras?.selection ? undefined : rowData,
      ...extras,
    });

  const targetHandlers: Record<string, TargetHandler> = {
    page: (target, _label, rowData) => {
      const pageTarget = target as ActionTarget & { type: "page" };
      navigateDms(targetUrl(pageTarget.url, rowData));
    },
    external: (target, _label, rowData) => {
      const externalTarget = target as ActionTarget & { type: "external" };
      const url = targetUrl(externalTarget.url, rowData);
      if (typeof window === "undefined" || !url) return;
      if (externalTarget.newTab) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      window.location.href = url;
    },
    api: async (target, label, rowData) => {
      const apiTarget = target as ActionTarget & { type: "api" };
      const url = targetUrl(apiTarget.url, rowData);
      await handleApiTarget(apiTarget, url, label, rowData);
    },
    exportJob: async (target, _label, rowData) => {
      const jobTarget = target as ActionTarget & { type: "exportJob" };
      const url = targetUrl(jobTarget.url, rowData);
      await handleExportJobTarget(jobTarget, url, rowData);
    },
    download: (target, label, rowData) =>
      handleDownloadTarget(target as DownloadTarget, label, rowData),
    modal: componentHandler,
    // Runs the quick action as the command palette does; one the user is not
    // served runs nothing.
    quickAction: (target) => {
      const { id } = target as ActionTarget & { type: "quickAction" };
      const quickAction = findServedQuickAction(
        useSiteLayout().quickActions.value?.actions,
        id,
      );
      if (quickAction) dispatchQuickActionTarget(quickAction.target);
    },
    drawer: componentHandler,
    sidePanel: sidePanelHandler,
  };

  // A target making a request runs it from inside its confirmation, which
  // shows a refusal (under its field when it names one) and stays open; any
  // other runs once confirmed.
  const confirmedRuns: Partial<
    Record<
      ActionTarget["type"],
      (target: ActionTarget, rowData?: Data) => ConfirmedRun
    >
  > = {
    api: (target, rowData) => (values) => {
      const apiTarget = target as ActionTarget & { type: "api" };
      return requestApiTarget(
        apiTarget,
        targetUrl(apiTarget.url, rowData),
        rowData,
        values,
      );
    },
  };

  // `{{row.id}}` of a confirmation's `from` URL, when the row carries an id.
  const rowUrlParams = (rowData?: Data) => {
    const id = rowData
      ? get(rowData, config.rowIdKey ?? DEFAULT_ROW_ID_KEY)
      : undefined;
    return id === undefined || id === null ? undefined : { id };
  };

  /**
   * Runs an action's target, after its confirmation when it declares one.
   * On a row action, the dialog's texts take the row's fields as parameters
   * ("Make {name} an owner?").
   */
  const handleActionTarget = async (
    target: ActionTarget,
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
    const runInside = confirmedRuns[target.type]?.(target, rowData);
    const isConfirmed = await confirmAction(declared, {
      row: rowData,
      urlParams: rowUrlParams(rowData),
      run: runInside,
    });
    if (isConfirmed && !runInside) {
      await handler(target, label, rowData, extras);
    }
  };

  // Reached for a disabled button only through a quick action, which presses
  // it by id: the reason is told instead of the target being opened.
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
    void handleActionTarget(
      action.target,
      action.label,
      rowData,
      action.confirm,
      { deepLink: isDeepLinkAction(action) },
    );
  };

  /**
   * Runs a bulk custom action on the selection: a URL target carries the
   * ids (or the filters of "Select all N matching") in its query, a drawer
   * or modal receives `selection`, and the texts receive `{ count }`.
   */
  const handleBulkCustomAction = (
    action: CustomRowAction,
    selection: BulkSelection,
  ) => {
    const query = bulkSelectionQuery(selection);
    const declared =
      action.confirm && isConfirmFrom(action.confirm)
        ? { from: withQuery(action.confirm.from, query) }
        : action.confirm;
    void handleActionTarget(
      targetWithSelection(action.target, query),
      action.label,
      { count: selection.count },
      declared,
      { selection },
    );
  };

  /**
   * Opens a side panel action on a row its link names but its route answered
   * 404 for: the panel says the row is gone, and closing it removes the link.
   * Another target opens nothing: no row, no drawer.
   */
  const handleMissingRow = (action: CustomRowAction, id: string) => {
    if (action.target.type !== "sidePanel") return;
    handleSidePanelTarget({
      target: action.target,
      title: processI18n(action.target.title || action.label),
      containerId: `${config.pageId}-${config.componentId}-${action.target.type}`,
      deepLink: isDeepLinkAction(action),
      missingId: id,
    });
  };

  return {
    handleCustomButton,
    handleCustomRowAction,
    handleBulkCustomAction,
    handleMissingRow,
  };
}
