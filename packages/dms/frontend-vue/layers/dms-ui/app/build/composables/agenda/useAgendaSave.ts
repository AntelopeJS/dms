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
  AgendaRefusal,
  ResolvedAgendaOptions,
  ResolvedAgendaView,
} from "./agendaModel";
import { agendaEditKey, overlayEdits, overlayPending } from "./agendaChanges";
import {
  createAgendaSaveEngine,
  type AgendaSaveEngine,
} from "./agendaSaveEngine";
import { useAgendaSaveStatus } from "./useAgendaSaveStatus";
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

/** The scope of a change of a recurring occurrence, as `recurringEdit` says; `null`: the user backed out. */
function useRecurringScope(raw: FullAgendaOptions) {
  const recurring = useAgendaRecurringPrompt();
  return async (
    change: AgendaChange,
  ): Promise<AgendaChange["scope"] | null> => {
    if (!change.occurrence || change.scope) return change.scope;
    const edit = raw.recurringEdit ?? "ask";
    if (edit !== "ask") return edit;
    return recurring.ask(change.kind === "delete" ? "delete" : "update");
  };
}

/** What the engine of an agenda reports to, besides the data. */
interface AgendaEngineHooks {
  toasts: ReturnType<typeof useAgendaSaveToasts>;
  status: ReturnType<typeof useAgendaSaveStatus>;
}

/** The save engine of an agenda, wired to its data, its toasts and its status. */
function useAgendaEngine(setup: AgendaSaveSetup, hooks: AgendaEngineHooks) {
  const { raw, source, text, options } = setup;
  const { t } = useI18n();
  const { toasts, status } = hooks;
  const engine: AgendaSaveEngine = createAgendaSaveEngine({
    mode: () => raw.saveMode ?? "immediate",
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
    onSaved: (written, response) => {
      status.settle("saved");
      toasts.saved(written, response);
    },
    onFailed: (edits) => {
      status.settle("error");
      toasts.failed(edits);
    },
    onConflict: (edit) => {
      status.settle("error");
      toasts.conflict(edit);
    },
    onGone: toasts.gone,
    onDeclined: status.clear,
    describeError: (error) => resolveActionError(error, t),
    text: (message) => text(message),
    timeZone: () => options.value.timeZone,
    unaddressed: () => t(`${SAVE_PREFIX}.unaddressed`),
  });
  return engine;
}

/**
 * The editing of an agenda around its save engine: `apply` places a change
 * (asking which part of a recurring event it applies to, as
 * `recurringEdit` says), the engine writes it at once or keeps it staged,
 * the toasts tell how it went (see `useAgendaSaveToasts`), the status
 * follows it (see `useAgendaSaveStatus`), a `confirm` question is asked
 * before the same changes go again with `force`, and leaving the page with
 * changes not written asks first.
 */
export function useAgendaSave(setup: AgendaSaveSetup) {
  const { raw, options, source } = setup;
  const scopeOf = useRecurringScope(raw);
  const mode = () => raw.saveMode ?? "immediate";
  const lastRefusal = ref<AgendaRefusal | null>(null);
  const status = useAgendaSaveStatus(() => engine);
  const toasts = useAgendaSaveToasts({
    raw,
    text: setup.text,
    announce: setup.announce,
    engine: () => engine,
    lastRefusal,
    // A Retry reads the event as it is now: it may have moved since.
    resend: (edit) => apply({ ...edit.change, previous: undefined }),
    onUndone: (isUndone) => status.settle(isUndone ? "saved" : "error"),
  });
  const engine = useAgendaEngine(setup, { toasts, status });

  const eventById = (id: string | undefined) =>
    id ? source.data.value.events.find((event) => event.id === id) : undefined;

  /**
   * Places a change: drawn at once, then written (immediate) or kept
   * (staged). Resolves `false` when it was not placed (editing off, the
   * scope prompt abandoned) or the route refused it.
   */
  async function apply(
    change: AgendaChange,
    occurrence?: AgendaOccurrence,
  ): Promise<boolean> {
    if (!options.value.editable) return false;
    const scope = await scopeOf(change);
    if (scope === null) return false;
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
    return engine.record(next, {
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

  /** Writes the staged changes; a refusal is told once, by `onFailed`. */
  async function saveStaged(): Promise<void> {
    if (!engine.sendable.value.length || engine.isSaving.value) return;
    await engine.saveAll();
  }

  useUnsavedChanges({ dirty: () => engine.hasUnsaved.value });

  return {
    engine,
    apply,
    saveStaged,
    lastRefusal,
    discardStaged: () => engine.discardAll(),
    staged: computed(() => (mode() === "staged" ? engine.staged.value : [])),
    saving: computed(() => engine.isSaving.value),
    /** What a Save writes: conflicts and changes being written aside. */
    sendableCount: computed(() => engine.sendable.value.length),
    saveStatus: status.status,
    /** The events read with the changes not written laid over them, and how each shows. */
    overlay: computed(() =>
      overlayEdits(
        source.data.value.events,
        engine.edits.value,
        mode(),
        options.value.timeZone,
      ),
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
  const NO_BREAK = "\u00a0";
  return {
    message,
    announce: (text: string) => {
      message.value = message.value === text ? `${text}${NO_BREAK}` : text;
    },
  };
}

export type AgendaSaving = ReturnType<typeof useAgendaSave>;
