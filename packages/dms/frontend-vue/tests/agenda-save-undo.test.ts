import { afterEach, describe, expect, it, vi } from "vitest";
import { toastEngine } from "./helpers/agenda-save-harness";
import { ref } from "vue";
import type { AgendaRefusal } from "../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import { useAgendaSaveToasts } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaSaveToasts";
import type {
  AgendaChange,
  AgendaSaveResponse,
} from "../layers/dms-ui/app/types/full-agenda";

interface ToastInput {
  actions?: { onClick: () => void }[];
}

afterEach(() => vi.unstubAllGlobals());

describe("the Undo of a save", () => {
  it("writes the inverse once when Undo is clicked twice in a row (fails when a double click sends the inverse again and the second answer reads as 'could not undo')", async () => {
    const toasts: ToastInput[] = [];
    vi.stubGlobal("useI18n", () => ({
      t: (key: string) => key,
    }));
    vi.stubGlobal("useToast", () => ({
      add: (toast: ToastInput) => {
        toasts.push(toast);
        return { id: toasts.length };
      },
      remove: vi.fn(),
    }));
    const writeNow = vi.fn(async (_changes: AgendaChange[]) => true);
    const { saved } = useAgendaSaveToasts({
      raw: { undoSeconds: 10 },
      text: String,
      announce: vi.fn(),
      engine: () => toastEngine({ writeNow }),
      lastRefusal: ref<AgendaRefusal | null>(null),
      resend: vi.fn(),
    });
    const move: AgendaChange = {
      kind: "move",
      id: "a",
      patch: { start: "2026-10-21T10:00:00+02:00" },
      previous: { start: "2026-10-21T09:00:00+02:00" },
    };

    const answer: AgendaSaveResponse = { events: [] };
    saved([move], answer);
    const undo = toasts[0]!.actions![0]!;
    undo.onClick();
    undo.onClick();
    await Promise.resolve();

    expect(writeNow).toHaveBeenCalledTimes(1);
  });
});
