import type { BlockText } from "#dms-core/app/types/composed-text";
import type {
  AgendaChange,
  AgendaSaveResponse,
  FullAgendaOptions,
} from "../../../types/full-agenda";
import { inverseChange, type AgendaEdit } from "./agendaChanges";
import type { AgendaSaveEngine } from "./agendaSaveEngine";
import { agendaNewId } from "./agendaApply";
import { DEFAULT_UNDO_SECONDS } from "./agendaOptions";

const MS_PER_SECOND = 1000;
const CONFLICT_TOAST_MS = 20_000;
const SAVE_PREFIX = "dms.agenda.save";

export interface AgendaSaveToastSetup {
  raw: FullAgendaOptions;
  text: (value: BlockText | undefined) => string;
  announce: (message: string) => void;
  /** The engine, once built (the toasts are wired into it). */
  engine: () => AgendaSaveEngine;
}

/** The title a change is told by: its event's, else the new event's. */
export const editTitle = (edit: Pick<AgendaEdit, "change" | "base" | "seed">) =>
  edit.base?.title ?? edit.seed?.title ?? edit.change.patch?.title ?? "";

/** The changes an Undo writes after `written`, each new event by the id the route gave it. */
export function undoChanges(
  written: AgendaChange[],
  response: AgendaSaveResponse,
): AgendaChange[] {
  const answered = new Map(
    (response.events ?? [])
      .filter((event) => event.tempId)
      .map((event) => [event.tempId as string, event.id]),
  );
  return written
    .map((change) =>
      inverseChange(
        change,
        change.tempId ? answered.get(change.tempId) : undefined,
        () => agendaNewId(),
      ),
    )
    .filter((change): change is AgendaChange => change !== null);
}

/**
 * What the agenda tells of its saves: Saved with Undo for `undoSeconds` (or
 * the route's message), a refusal with Retry, a conflict with Overwrite /
 * Discard, an event gone. Each toast has an id of its own: Nuxt UI drops
 * every toast of an id a moment after `remove(id)`, a new one included.
 */
export function useAgendaSaveToasts(setup: AgendaSaveToastSetup) {
  const { raw } = setup;
  const { t } = useI18n();
  const toast = useToast();
  const label = (key: string, params: Record<string, unknown> = {}) =>
    t(`${SAVE_PREFIX}.${key}`, params);
  const counted = (key: string, count: number) =>
    t(`${SAVE_PREFIX}.${key}`, { count }, count);
  let undoToastId: string | number | null = null;

  async function undo(changes: AgendaChange[]): Promise<void> {
    const isUndone = await setup.engine().writeNow(changes);
    toast.add({
      title: isUndone ? label("undone") : label("undo_failed"),
      color: isUndone ? "neutral" : "error",
      icon: isUndone ? "i-ph-arrow-counter-clockwise" : "i-ph-warning-circle",
    });
  }

  function saved(written: AgendaChange[], response: AgendaSaveResponse): void {
    const message = response.message ? setup.text(response.message) : undefined;
    const title = message ?? counted("saved_toast", written.length);
    setup.announce(title);
    const seconds = raw.undoSeconds ?? DEFAULT_UNDO_SECONDS;
    const inverses = undoChanges(written, response);
    const canUndo = seconds > 0 && inverses.length > 0;
    if (!canUndo && !message) return;
    if (undoToastId !== null) toast.remove(undoToastId);
    undoToastId = toast.add({
      title,
      color: "success",
      icon: "i-ph-check-circle",
      duration: Math.max(seconds, 1) * MS_PER_SECOND,
      actions: canUndo
        ? [
            {
              label: label("undo"),
              icon: "i-ph-arrow-counter-clockwise",
              color: "neutral",
              variant: "outline",
              onClick: () => void undo(inverses),
            },
          ]
        : undefined,
    }).id;
  }

  async function retry(keys: string[]): Promise<void> {
    const engine = setup.engine();
    if (raw.saveMode === "staged") {
      await engine.saveAll();
      return;
    }
    await Promise.all(keys.map((key) => engine.retry(key)));
  }

  function failed(edits: AgendaEdit[]): void {
    const [first] = edits;
    if (!first) return;
    const title =
      edits.length === 1
        ? label("failed", { title: editTitle(first) })
        : counted("not_saved_toast", edits.length);
    setup.announce(title);
    toast.add({
      title,
      description: first.message,
      color: "error",
      icon: "i-ph-warning-circle",
      actions: [
        {
          label: label("retry"),
          icon: "i-ph-arrow-clockwise",
          color: "neutral",
          variant: "outline",
          onClick: () => void retry(edits.map((edit) => edit.key)),
        },
      ],
    });
  }

  function conflict(edit: AgendaEdit): void {
    const title = label("conflict_title", { title: editTitle(edit) });
    setup.announce(title);
    toast.add({
      title,
      description: edit.message || label("conflict_description"),
      color: "warning",
      icon: "i-ph-git-diff",
      duration: CONFLICT_TOAST_MS,
      actions: [
        {
          label: label("overwrite"),
          color: "warning",
          variant: "solid",
          onClick: () => void setup.engine().overwrite(edit.key),
        },
        {
          label: label("discard"),
          color: "neutral",
          variant: "outline",
          onClick: () => setup.engine().discard(edit.key),
        },
      ],
    });
  }

  function gone(edits: AgendaEdit[]): void {
    for (const edit of edits)
      toast.add({
        title: label("gone", { title: editTitle(edit) }),
        color: "neutral",
        icon: "i-ph-trash",
      });
  }

  /** After a Save of the staged changes, the ones still refused. */
  function notSaved(count: number): void {
    toast.add({
      title: counted("not_saved_toast", count),
      color: "error",
      icon: "i-ph-warning-circle",
    });
  }

  return { saved, failed, conflict, gone, notSaved };
}
