/**
 * How long the calendar block's "saved" toast stays: a message the route
 * says to read in full has no timer and closes when the user closes it; a plain "saved" keeps its seconds and its
 * Undo.
 */
import { toastEngine } from "./helpers/agenda-save-harness";
import { ref } from "vue";
import type { AgendaRefusal } from "../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAgendaSaveToasts } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaSaveToasts";
import type { AgendaChange } from "../layers/dms-ui/app/types/full-agenda";

interface ToastInput {
  duration?: number;
  close?: unknown;
  actions?: { label: string }[];
}

afterEach(() => vi.unstubAllGlobals());

type SaveResponse = Parameters<
  ReturnType<typeof useAgendaSaveToasts>["saved"]
>[1];

/** The toasts on screen after each `responses` save of a move, as `toast.add` and `toast.remove` leave them. */
function toastsOnScreen(responses: SaveResponse[]) {
  const shown = new Map<number, ToastInput & { title?: string }>();
  let next = 0;
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({
    add: (toast: ToastInput & { title?: string }) => {
      next += 1;
      shown.set(next, toast);
      return { id: next };
    },
    remove: (id: number) => shown.delete(id),
  }));
  const { saved } = useAgendaSaveToasts({
    raw: { undoSeconds: 6 },
    text: String,
    announce: vi.fn(),
    engine: () => toastEngine(),
    lastRefusal: ref<AgendaRefusal | null>(null),
    resend: vi.fn(),
  });
  const move: AgendaChange = {
    kind: "move",
    id: "a",
    patch: { start: "2026-10-21T10:00:00+02:00" },
    previous: { start: "2026-10-21T09:00:00+02:00" },
  };
  for (const response of responses) saved([move], response);
  return [...shown.values()].map((toast) => ({
    title: toast.title,
    duration: toast.duration,
    closes: toast.close !== false,
    actions: (toast.actions ?? []).map((action) => action.label),
  }));
}

/** The toast `saved` shows for `response` after a move, Undo at six seconds. */
function toastOf(response: SaveResponse) {
  const [toast] = toastsOnScreen([response]);
  return {
    duration: toast?.duration,
    closes: toast?.closes,
    actions: toast?.actions,
  };
}

describe("the saved toast of the calendar block", () => {
  it("keeps a message that names days open until it is closed (fails when it closes after the Undo seconds)", () => {
    expect(
      toastOf({
        events: [],
        message: "Horaire modifié. Le mardi 1 décembre 2026 reste sur Salle 2.",
        messageStays: true,
      }),
    ).toEqual({ duration: 0, closes: true, actions: ["dms.agenda.save.undo"] });
  });

  it("keeps six seconds and Undo on a plain saved toast (fails when every saved toast stays)", () => {
    expect(toastOf({ events: [] })).toEqual({
      duration: 6000,
      closes: true,
      actions: ["dms.agenda.save.undo"],
    });
  });
});

describe("several saved toasts of the calendar block", () => {
  it("leaves every toast that names days on screen through later saves, one plain toast with Undo (fails when the next save removes a staying toast, or when a plain toast stops replacing the previous one)", () => {
    const first =
      "Horaire modifié. Le jeudi 3 décembre 2026 ne passe pas à Bram Stevens.";
    const second =
      "Horaire modifié. Le mardi 1 décembre 2026 reste sur Salle 2.";
    expect(
      toastsOnScreen([
        { events: [], message: first, messageStays: true },
        { events: [] },
        { events: [], message: second, messageStays: true },
        { events: [] },
      ]),
    ).toEqual([
      {
        title: first,
        duration: 0,
        closes: true,
        actions: ["dms.agenda.save.undo"],
      },
      {
        title: second,
        duration: 0,
        closes: true,
        actions: ["dms.agenda.save.undo"],
      },
      {
        title: "dms.agenda.save.saved_toast",
        duration: 6000,
        closes: true,
        actions: ["dms.agenda.save.undo"],
      },
    ]);
  });
});
