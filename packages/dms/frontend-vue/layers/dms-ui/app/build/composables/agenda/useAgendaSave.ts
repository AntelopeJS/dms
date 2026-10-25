import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { BlockText } from "#dms-core/app/types/composed-text";
import type {
  AgendaChange,
  AgendaConfirm,
  AgendaSaveRequest,
  AgendaSaveResponse,
  FullAgendaOptions,
} from "../../../types/full-agenda";
import { useConfirm } from "../../../composables/confirm/useConfirm";
import { useUnsavedChanges } from "../../../composables/unsaved-changes/useUnsavedChanges";
import { resolveActionError } from "../confirm/actionError";
import { resolveUrlVariables } from "../../utils/urlVariables";
import { useAgendaRecurringPrompt } from "./useAgendaDetails";
import type {
  AgendaOccurrence,
  AgendaRange,
  ResolvedAgendaOptions,
  ResolvedAgendaView,
} from "./agendaModel";
import { agendaEditKey, overlayEdits, overlayPending } from "./agendaChanges";
import { createAgendaSaveEngine } from "./agendaSaveEngine";
import { completeChange, seedOfItem } from "./agendaApply";
import { leavesLocalId } from "./agendaData";
import type { AgendaDataSource } from "./useAgendaData";
import { useAgendaSaveToasts } from "./useAgendaSaveToasts";

const SAVE_PREFIX = "dms.agenda.save";

export interface AgendaSaveSetup {
  raw: FullAgendaOptions;
  options: ComputedRef<ResolvedAgendaOptions>;
  routeParams: () => Record<string, string> | undefined;
  source: AgendaDataSource;
  range: ComputedRef<AgendaRange>;
  view: ComputedRef<ResolvedAgendaView>;
  text: (value: BlockText | undefined) => string;
  /** Writes a message to the agenda's live region. */
  announce: (message: string) => void;
}

/** Posts a request to `saveUrl`, its `{{params.X}}` / `{{query.X}}` filled. */
function useSaveRequest(
  raw: FullAgendaOptions,
  routeParams: () => Record<string, string> | undefined,
) {
  const { $authFetch } = useAuthFetch();
  const route = useDmsRoute();
  return async (
    request: AgendaSaveRequest,
  ): Promise<AgendaSaveResponse | null> => {
    const url = resolveUrlVariables(raw.saveUrl, {
      routeParams: routeParams(),
      routeQuery: route.query as Record<string, unknown>,
    });
    if (!url) throw new Error(`${SAVE_PREFIX}.unresolved`);
    return $authFetch<AgendaSaveResponse>(url, {
      method: (raw.saveUrlMethod ?? "POST") as "POST",
      body: request,
    });
  };
}

/** The `confirm` question of an answer, asked in the DMS's dialog. */
function useAskConfirm(text: (value: BlockText | undefined) => string) {
  const { confirm } = useConfirm();
  const { t } = useI18n();
  return (question: AgendaConfirm) =>
    confirm({
      title: text(question.title),
      description: question.message ? text(question.message) : undefined,
      confirmLabel: question.confirmLabel
        ? text(question.confirmLabel)
        : t(`${SAVE_PREFIX}.confirm`),
      color: "warning",
      icon: "i-ph-question",
    });
}

/**
 * The editing of an agenda around its save engine: `apply` places a change
 * (asking which part of a recurring event it applies to, as
 * `recurringEdit` says), the engine writes it at once or keeps it staged,
 * the toasts tell how it went (see `useAgendaSaveToasts`), a `confirm`
 * question is asked before the same changes go again with `force`, and
 * leaving the page with changes not written asks first.
 */
export function useAgendaSave(setup: AgendaSaveSetup) {
  const { raw, options, source, text } = setup;
  const { t } = useI18n();
  const recurring = useAgendaRecurringPrompt();
  const mode = () => raw.saveMode ?? "immediate";
  const toasts = useAgendaSaveToasts({
    raw,
    text,
    announce: setup.announce,
    engine: () => engine,
  });

  const engine = createAgendaSaveEngine({
    mode,
    send: useSaveRequest(raw, setup.routeParams),
    context: () => ({
      conflicts: raw.conflicts ?? "overwrite",
      from: setup.range.value.from,
      to: setup.range.value.to,
      view: setup.view.value.id,
    }),
    confirm: useAskConfirm(text),
    onAnswer: (response, written) => {
      source.applyAnswer(
        response,
        written,
        (change) => engine.editOf(agendaEditKey(change))?.seed,
      );
      // An id the route never named stays on screen: read its own ids.
      if (leavesLocalId(response, written)) void source.refresh();
    },
    onSaved: toasts.saved,
    onFailed: toasts.failed,
    onConflict: toasts.conflict,
    onGone: toasts.gone,
    describeError: (error) => resolveActionError(error, t),
    text: (message) => text(message),
  });

  /** The scope of a change of a recurring occurrence; `null`: the user backed out. */
  async function scopeOf(
    change: AgendaChange,
  ): Promise<AgendaChange["scope"] | null> {
    if (!change.occurrence || change.scope) return change.scope;
    const edit = raw.recurringEdit ?? "ask";
    if (edit !== "ask") return edit;
    return recurring.ask(change.kind === "delete" ? "delete" : "update");
  }

  const eventById = (id: string | undefined) =>
    id ? source.data.value.events.find((event) => event.id === id) : undefined;

  /** Places a change: drawn at once, then written (immediate) or kept (staged). */
  async function apply(
    change: AgendaChange,
    occurrence?: AgendaOccurrence,
  ): Promise<void> {
    if (!options.value.editable) return;
    const scope = await scopeOf(change);
    if (scope === null) return;
    const next = completeChange({
      change,
      occurrence,
      event: eventById(change.id),
      scope,
      timeZone: options.value.timeZone,
    });
    const item =
      next.kind === "schedule"
        ? source.data.value.unscheduled?.find((entry) => entry.id === next.id)
        : undefined;
    await engine.record(next, {
      seed: item && next.tempId ? seedOfItem(item, next.tempId) : undefined,
      base: occurrence?.event ?? eventById(next.id),
      ghost: occurrence && {
        start: occurrence.start,
        end: occurrence.end,
        allDay: occurrence.allDay,
        resourceIds: occurrence.resourceIds,
      },
    });
  }

  async function saveStaged(): Promise<void> {
    if (!engine.count.value || engine.isSaving.value) return;
    if (await engine.saveAll()) return;
    const failed = engine.edits.value.filter(
      (edit) => edit.status === "error",
    ).length;
    if (failed) toasts.notSaved(failed);
  }

  useUnsavedChanges({ dirty: () => engine.hasUnsaved.value });

  return {
    engine,
    apply,
    saveStaged,
    discardStaged: () => engine.discardAll(),
    staged: computed(() => (mode() === "staged" ? engine.staged.value : [])),
    saving: computed(() => engine.isSaving.value),
    /** The events read with the changes not written laid over them, and how each shows. */
    overlay: computed(() =>
      overlayEdits(source.data.value.events, engine.edits.value, mode()),
    ),
    pending: computed(() =>
      overlayPending(
        source.data.value.unscheduled ?? [],
        engine.edits.value,
        mode(),
      ),
    ),
    retry: (key: string) => engine.retry(key),
    resolveConflict: async (key: string, choice: "overwrite" | "discard") => {
      if (choice === "overwrite") return engine.overwrite(key);
      engine.discard(key);
      return true;
    },
  };
}

/** A live region's message: set again even when it is the same text. */
export function useLiveMessage(): {
  message: Ref<string>;
  announce: (text: string) => void;
} {
  const message = ref("");
  const NO_BREAK = " ";
  return {
    message,
    announce: (text: string) => {
      message.value = message.value === text ? `${text}${NO_BREAK}` : text;
    },
  };
}

export type AgendaSaving = ReturnType<typeof useAgendaSave>;
