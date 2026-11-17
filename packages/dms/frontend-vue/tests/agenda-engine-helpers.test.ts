/** @vitest-environment jsdom */
/**
 * The helpers around the FullAgenda engine: an Undo's `previous`, the
 * keyboard in the order chips are drawn, one colour check, a period held
 * within `minDate` / `maxDate`, and the save status.
 */
import type { AgendaStatusEngine } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaSaveStatus";
import { occurrenceStub } from "./fixtures/agendaFakeContext";
import { effectScope, reactive, computed, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { completeChange } from "../layers/dms-ui/app/entries/composables/agenda/agendaApply";
import { useAgendaShortcuts } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaShortcuts";
import { agendaColorCss } from "../layers/dms-ui/app/entries/composables/agenda/agendaPaint";
import { clampDays } from "../layers/dms-ui/app/entries/composables/agenda/agendaRange";
import { useAgendaSaveStatus } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaSaveStatus";
import type { AgendaEdit } from "../layers/dms-ui/app/entries/composables/agenda/agendaChanges";
import type { AgendaChange } from "../layers/dms-ui/app/types/full-agenda";

const BXL = "Europe/Brussels";
const moveA: AgendaChange = {
  kind: "move",
  id: "a",
  patch: { start: "2026-10-21T22:00:00+02:00" },
  previous: { start: "2026-10-21T09:00:00+02:00" },
};

describe("an Undo's previous", () => {
  it("is null for an end the event did not hold, whatever the caller left undefined", () => {
    const change = completeChange({
      change: {
        kind: "move",
        id: "a",
        patch: {
          start: "2026-10-21T14:00:00+02:00",
          end: "2026-10-21T15:00:00+02:00",
        },
        previous: { start: "2026-10-21T09:00:00+02:00", end: undefined },
      },
      event: { id: "a", title: "A", start: "2026-10-21T09:00:00+02:00" },
      timeZone: BXL,
    });
    expect(change.previous).toEqual({
      start: "2026-10-21T09:00:00+02:00",
      end: null,
    });
  });
});

describe("the arrows step through the chips drawn", () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    document.body.innerHTML = "";
  });

  it("skips an event drawn behind a +N more", () => {
    document.body.innerHTML = `
      <div data-dms-agenda>
        <button data-agenda-occurrence="a">A</button>
        <button data-agenda-occurrence="c">C</button>
      </div>`;
    const root = document.querySelector<HTMLElement>("[data-dms-agenda]")!;
    const focusedKey = ref<string | null>(null);
    const scope = effectScope();
    scope.run(() =>
      useAgendaShortcuts({
        root: ref(root),
        enabled: () => true,
        isStaged: () => false,
        views: () => [],
        occurrences: () =>
          ["a", "b", "c"].map((key) => occurrenceStub({ key })),
        focusedKey,
        goToday: vi.fn(),
        go: vi.fn(),
        setView: vi.fn(),
        createNew: vi.fn(),
        open: vi.fn(),
        remove: vi.fn(),
        saveStaged: vi.fn(),
        hasStaged: () => false,
        runShortcut: () => false,
        cancel: vi.fn(),
      }),
    );
    stop = () => scope.stop();
    const chipA = root.querySelector<HTMLElement>(
      '[data-agenda-occurrence="a"]',
    )!;
    chipA.focus();
    chipA.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(document.activeElement?.getAttribute("data-agenda-occurrence")).toBe(
      "c",
    );
    expect(focusedKey.value).toBe("c");
  });
});

describe("one colour check, the same everywhere", () => {
  it("takes CSS named colours and colour functions, and nothing else", () => {
    expect(agendaColorCss("teal")).toBe("teal");
    expect(agendaColorCss("Teal")).toBe("Teal");
    expect(agendaColorCss("tael")).toBe("var(--ui-primary)");
    expect(agendaColorCss("oklch(0.62 0.15 258)")).toBe("oklch(0.62 0.15 258)");
    expect(agendaColorCss("#12345")).toBe("var(--ui-primary)");
  });
});

describe("a period picked past minDate / maxDate", () => {
  it("shows the roster's last 30 days as its published weeks 40 to 42", () => {
    expect(
      clampDays(
        { from: "2026-09-26", to: "2026-10-26" },
        { min: "2026-09-28", max: "2026-10-18" },
      ),
    ).toEqual({ from: "2026-09-28", to: "2026-10-18" });
    expect(
      clampDays(
        { from: "2026-11-01", to: "2026-11-30" },
        { max: "2026-10-18" },
      ),
    ).toEqual({ from: "2026-10-18", to: "2026-10-18" });
  });
});

describe("the save status", () => {
  afterEach(() => vi.useRealTimers());

  const NO_EDITS: AgendaEdit[] = [];

  function fakeEngine() {
    const state = reactive({
      saving: false,
      writing: false,
      edits: NO_EDITS,
    });
    const engine: AgendaStatusEngine = {
      isSaving: computed(() => state.saving),
      isWritingNow: computed(() => state.writing),
      edits: computed(() => state.edits),
    };
    return { state, engine };
  }

  it("tells saving, an error while one waits, a refusal for a moment, and clears a declined confirm", () => {
    vi.useFakeTimers();
    const { state, engine } = fakeEngine();
    const scope = effectScope();
    const status = scope.run(() => useAgendaSaveStatus(() => engine))!;
    state.writing = true;
    expect(status.status.value).toBe("saving");
    state.writing = false;
    status.settle("error");
    expect(status.status.value).toBe("error");
    vi.advanceTimersByTime(7000);
    expect(status.status.value).toBe("idle");
    state.edits = [{ key: "a", change: moveA, status: "conflict" }];
    expect(status.status.value).toBe("error");
    state.edits = [];
    status.settle("saved");
    status.clear();
    expect(status.status.value).toBe("idle");
    scope.stop();
  });
});
