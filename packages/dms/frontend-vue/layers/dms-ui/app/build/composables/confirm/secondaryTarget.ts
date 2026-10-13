import type {
  ConfirmDialogLinkTarget,
  ConfirmDialogSecondaryTarget,
} from "#dms-core/app/types/confirm-dialog";
import { type DownloadFetch, saveDownload } from "../../utils/fileDownload";
import type { SecondaryTargetRun } from "./confirmDialogTexts";

function openLink(target: ConfirmDialogLinkTarget): void {
  if (typeof window === "undefined" || !target.url) return;
  if (target.newTab) {
    window.open(target.url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = target.url;
}

/**
 * Runs the target of a confirmation's secondary action, the dialog left
 * open: a link opens, a download is fetched with `fetchRaw` and saved.
 */
export function secondaryTargetRunner(
  fetchRaw: DownloadFetch,
): SecondaryTargetRun {
  return (target: ConfirmDialogSecondaryTarget) =>
    target.type === "download"
      ? saveDownload(target, fetchRaw)
      : openLink(target);
}
