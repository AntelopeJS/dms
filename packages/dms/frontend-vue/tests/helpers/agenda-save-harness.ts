/** The FullAgenda save engine under test: a harness whose requests wait for the test. */
import { vi } from "vitest";
import {
  createAgendaSaveEngine,
  type AgendaSaveEngineOptions,
} from "../../layers/dms-ui/app/build/composables/agenda/agendaSaveEngine";
import { type AgendaEdit } from "../../layers/dms-ui/app/build/composables/agenda/agendaChanges";
import type {
  AgendaChange,
  AgendaSaveMode,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "../../layers/dms-ui/app/types/full-agenda";

export interface PendingSave {
  request: AgendaSaveRequest;
  resolve: (response: AgendaSaveResponse | Error) => void;
}

/** An engine whose requests wait until the test answers them. */
export function harness(
  mode: AgendaSaveMode,
  overrides: Partial<AgendaSaveEngineOptions> = {},
) {
  const pending: PendingSave[] = [];
  const answers: Array<{
    response: AgendaSaveResponse;
    written: AgendaChange[];
  }> = [];
  const saved: AgendaChange[][] = [];
  const failed: string[][] = [];
  const failedEdits: AgendaEdit[] = [];
  const confirm = vi.fn(async () => true);
  const engine = createAgendaSaveEngine({
    mode: () => mode,
    send: (request) =>
      new Promise((resolve, reject) =>
        pending.push({
          request,
          resolve: (response) =>
            response instanceof Error ? reject(response) : resolve(response),
        }),
      ),
    context: () => ({
      conflicts: "detect",
      from: "2026-10-19",
      to: "2026-10-25",
      view: "week",
    }),
    confirm,
    onAnswer: (response, written) => answers.push({ response, written }),
    onSaved: (written) => saved.push(written),
    onFailed: (edits) => {
      failed.push(edits.map((edit) => edit.key));
      failedEdits.push(...edits);
    },
    describeError: (error) => (error as Error).message,
    text: (message) => String(message),
    ...overrides,
  });
  /** Answers the oldest request still waiting, then lets the engine settle. */
  const answer = async (response: AgendaSaveResponse | Error = {}) => {
    const next = pending.shift();
    if (!next) throw new Error("No request is waiting.");
    next.resolve(response);
    await flush();
  };
  return {
    engine,
    pending,
    answers,
    saved,
    failed,
    failedEdits,
    confirm,
    answer,
  };
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export const move = (
  id: string,
  start: string,
  previous = "2026-10-20T09:00:00+02:00",
): AgendaChange => ({
  kind: "move",
  id,
  patch: { start },
  previous: { start: previous },
});
