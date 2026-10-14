import type {
  ActionConfirm,
  ConfirmDialog,
} from "#dms-core/app/types/confirm-dialog";
import { isConfirmFrom } from "#dms-core/app/types/confirm-dialog";
import { resolveActionError } from "./actionError";
import type {
  ConfirmOptions,
  ConfirmPartialOutcome,
  ConfirmValues,
} from "../../../composables/confirm/types";
import {
  type ConfirmTranslate,
  resolveConfirmDialog,
} from "./confirmDialogTexts";
import type { DownloadFetch } from "../../utils/fileDownload";
import { secondaryTargetRunner } from "./secondaryTarget";
import {
  namesPageValue,
  resolveLinkVariables,
} from "../../utils/urlVariables";
import { currentPageUrlValues } from "../page/pageUrlValues";

/** What an action asks its confirmation with. */
export interface ActionConfirmRequest {
  /** The row the action targets: its fields fill the texts and `from` URL. */
  row?: Record<string, unknown>;
  /** Fill-ins of a `from` URL besides the row's fields (`{{row.id}}`). */
  urlParams?: Record<string, unknown>;
  /**
   * The look of the action, where the dialog leaves it out (an archive's
   * amber, a delete's trash icon).
   */
  fallback?: Partial<ConfirmOptions>;
  /**
   * Runs the action from inside the dialog with its fields' values: a
   * refusal stays on screen, under its field when it names one. Without it,
   * the caller runs the action once the confirmation resolved `true`.
   */
  run?: (
    values: ConfirmValues,
  ) => Promise<void | boolean | ConfirmPartialOutcome>;
}

/**
 * Asks an action's confirmation (backend `confirm`): a fixed dialog, or the
 * one a `{ from }` URL answers for the row.
 */
export function useActionConfirm() {
  const { confirm } = useConfirm();
  const { $authFetch } = useAuthFetch();
  const { t } = useI18n();
  const toast = useToast();
  const runSecondaryTarget = secondaryTargetRunner(
    $authFetch.raw as unknown as DownloadFetch,
  );

  const loadDialog = async (
    declared: ActionConfirm,
    request: ActionConfirmRequest,
  ): Promise<ConfirmDialog | undefined> => {
    if (!isConfirmFrom(declared)) return declared;
    const from = namesPageValue(declared.from)
      ? resolveLinkVariables(declared.from, currentPageUrlValues())
      : declared.from;
    const url = interpolateUrl(from, {
      ...request.row,
      ...request.urlParams,
    });
    try {
      return await $authFetch<ConfirmDialog>(url);
    } catch (error) {
      toast.add({
        color: Color.error,
        icon: "i-ph-warning-circle",
        title: t("dms.form.error_title"),
        description: resolveActionError(error, t),
      });
      return undefined;
    }
  };

  /**
   * Asks the confirmation, running `request.run` inside it; resolves whether
   * the user confirmed (never for a `blocked` dialog, which only explains).
   */
  const confirmAction = async (
    declared: ActionConfirm,
    request: ActionConfirmRequest = {},
  ): Promise<boolean> => {
    const dialog = await loadDialog(declared, request);
    if (!dialog) return false;
    const options = resolveConfirmDialog(
      dialog,
      request.row,
      t as ConfirmTranslate,
      runSecondaryTarget,
    );
    const isConfirmed = await confirm({
      ...request.fallback,
      ...withoutUndefined(options),
      title: options.title,
      onConfirm: dialog.blocked ? undefined : request.run,
    });
    return isConfirmed && !dialog.blocked;
  };

  return { confirmAction };
}

// A text the dialog leaves out keeps the action's own (its fallback).
function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
