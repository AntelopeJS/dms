import { useClipboard } from "@vueuse/core";
import type { RowNavigationSource } from "./rowNavigation";
import type { TableUrlScope } from "../table-view/utils/views";
import { useActionConfirm } from "../confirm/useActionConfirm";
import {
  createActionRequests,
  createExportJobHandler,
} from "./actionTargetRequests";
import { createTargetRows, createRowTexts } from "./actionTargetRows";
import { createContainerOpener } from "./actionTargetContainers";
import { createSidePanelHandler } from "./actionTargetSidePanel";
import { createTargetHandlers } from "./actionTargetHandlers";
import { createActionTargetRunner } from "./actionTargetConfirmation";
import {
  createCustomActions,
  createMissingRowHandler,
} from "./actionTargetActions";

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
  const fetchRaw = useAuthFetch().$authFetch.raw;
  const requests = createActionRequests(config, {
    toast,
    processI18n,
    processApiMessage,
    handleApiError,
    t,
    copyToClipboard,
    fetchRaw,
  });
  const handleExportJobTarget = createExportJobHandler(
    runExportJob,
    processI18n,
  );
  const rows = createTargetRows(config);
  const texts = createRowTexts(processI18n, t);
  const openContainer = createContainerOpener(config, openModal, openDrawer);
  const componentContext = { config, rows, texts, openContainer };
  const handleSidePanelTarget = createSidePanelHandler(config, rows, texts);
  const targetHandlers = createTargetHandlers({
    config,
    processI18n,
    componentContext,
    handleSidePanelTarget,
    requests,
    handleExportJobTarget,
  });
  const handleActionTarget = createActionTargetRunner(
    targetHandlers,
    requests.requestApiTarget,
    confirmAction,
    rows.rowUrlParams,
  );
  const { handleCustomButton, handleCustomRowAction, handleBulkCustomAction } =
    createCustomActions(handleActionTarget, rows.rowIdOf, toast, processI18n);
  const handleMissingRow = createMissingRowHandler(
    config,
    processI18n,
    componentContext,
    handleSidePanelTarget,
  );
  return {
    handleCustomButton,
    handleCustomRowAction,
    handleBulkCustomAction,
    handleMissingRow,
  };
}
