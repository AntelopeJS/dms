import { h, type ComputedRef, type Ref } from "vue";
import { useEventListener } from "@vueuse/core";
import type { MatrixChange, MatrixOptions } from "../../../types/matrix";
import { useUnsavedChanges } from "../../../composables/unsaved-changes/useUnsavedChanges";
import { useConfirm } from "../../../composables/confirm/useConfirm";
import MatrixReviewList from "../../components/matrix/MatrixReviewList.vue";
import type { MatrixSaveEngine } from "./matrixSaveEngine";
import type { MatrixContext } from "./useMatrix";

const MS_PER_SECOND = 1000;
const SAVE_KEY = "s";
const BLOCK_SELECTOR = "[data-dms-matrix]";

export interface MatrixSavingOptions {
  options: MatrixOptions;
  engine: MatrixSaveEngine;
  isBlocked: ComputedRef<boolean>;
  targetMessage: ComputedRef<string | null>;
  /** The grid's own element, inside the block's. */
  root: Ref<HTMLElement | null>;
  /** Commits the cell being edited in place; whether one was open. */
  commitEditor: () => boolean;
  context: () => MatrixContext;
}

/**
 * Whether a keyboard shortcut is this block's: the focus is inside it, or
 * nowhere in another Matrix and it is the page's only one.
 */
export function ownsShortcut(block: Element | null | undefined): boolean {
  const active = document.activeElement?.closest(BLOCK_SELECTOR);
  if (active) return active === block;
  return document.querySelectorAll(BLOCK_SELECTOR).length === 1;
}

/**
 * The saving around the engine: the save bar and Ctrl+S (the review first
 * with `review`, refused while a `blockSave` target is missed), the Undo
 * toast after a save, and the guard on leaving with unsaved edits.
 */
export function useMatrixSaving(saving: MatrixSavingOptions) {
  const { options, engine, isBlocked } = saving;
  const { t } = useI18n();
  const toast = useToast();
  const { confirm } = useConfirm();
  let undoToastId: string | number | null = null;

  function offerUndo(changes: MatrixChange[]): void {
    const seconds = options.undoSeconds ?? 0;
    if (seconds <= 0) return;
    if (undoToastId !== null) toast.remove(undoToastId);
    undoToastId = toast.add({
      title: t(
        "dms.matrix.saved_toast",
        { count: changes.length },
        changes.length,
      ),
      color: "success",
      icon: "i-ph-check-circle",
      duration: seconds * MS_PER_SECOND,
      actions: [
        {
          label: t("dms.matrix.undo"),
          icon: "i-ph-arrow-counter-clockwise",
          color: "neutral",
          variant: "outline",
          onClick: () => void undo(changes),
        },
      ],
    }).id;
  }

  async function undo(changes: MatrixChange[]): Promise<void> {
    const isUndone = await engine.undo(changes);
    toast.add({
      title: isUndone ? t("dms.matrix.undone") : t("dms.matrix.undo_failed"),
      color: isUndone ? "neutral" : "error",
      icon: isUndone ? "i-ph-arrow-counter-clockwise" : "i-ph-warning-circle",
    });
  }

  async function saveNow(): Promise<void> {
    const isSaved = await engine.saveAll();
    if (isSaved || isBlocked.value) return;
    toast.add({
      title: t(
        "dms.matrix.not_saved_toast",
        { count: engine.failedCount.value },
        engine.failedCount.value,
      ),
      color: "error",
      icon: "i-ph-warning-circle",
    });
  }

  function warnBlocked(): void {
    toast.add({
      title: t("dms.matrix.blocked"),
      description: saving.targetMessage.value ?? undefined,
      color: "warning",
      icon: "i-ph-scales",
    });
  }

  /** The save bar and Ctrl+S: the review first when `review` is on. */
  async function requestSave(): Promise<void> {
    if (!engine.count.value || engine.isSaving.value) return;
    if (isBlocked.value) return warnBlocked();
    if (!options.review) return saveNow();
    const changes = engine.edits.value
      .filter((edit) => !edit.conflict)
      .map((edit) => ({ ...edit }));
    await confirm({
      title: t(
        "dms.matrix.review.title",
        { count: changes.length },
        changes.length,
      ),
      description: t("dms.matrix.review.description"),
      confirmLabel: t(
        "dms.matrix.save_label",
        { count: changes.length },
        changes.length,
      ),
      cancelLabel: t("dms.matrix.review.back"),
      icon: "i-ph-list-checks",
      color: "primary",
      body: () => h(MatrixReviewList, { changes, context: saving.context() }),
      onConfirm: () => saveNow(),
    });
  }

  useUnsavedChanges({ dirty: () => engine.hasUnsaved.value });

  useEventListener(
    typeof window === "undefined" ? undefined : window,
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== SAVE_KEY) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (options.saveMode !== "staged") return;
      const block = saving.root.value?.closest(BLOCK_SELECTOR);
      if (!ownsShortcut(block)) return;
      const hadEditor = saving.commitEditor();
      if (!hadEditor && !engine.count.value) return;
      event.preventDefault();
      void requestSave();
    },
  );

  return { offerUndo, requestSave };
}
