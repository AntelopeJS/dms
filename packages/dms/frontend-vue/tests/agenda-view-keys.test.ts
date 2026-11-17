/** @vitest-environment jsdom */
import type { AgendaView } from "../layers/dms-ui/app/types/full-agenda";
import { resolveAgendaViews } from "../layers/dms-ui/app/entries/composables/agenda/agendaRange";
import { effectScope, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAgendaShortcuts } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaShortcuts";

describe("the view keys of the agenda", () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    document.body.innerHTML = "";
  });

  function press(views: AgendaView[]) {
    document.body.innerHTML = `<div data-dms-agenda><button id="b">B</button></div>`;
    const root = document.querySelector<HTMLElement>("[data-dms-agenda]")!;
    const setView = vi.fn();
    const scope = effectScope();
    scope.run(() =>
      useAgendaShortcuts({
        root: ref(root),
        enabled: () => true,
        isStaged: () => false,
        views: () => resolveAgendaViews(views, {}, () => ""),
        occurrences: () => [],
        focusedKey: ref<string | null>(null),
        goToday: vi.fn(),
        go: vi.fn(),
        setView,
        createNew: vi.fn(),
        open: vi.fn(),
        remove: vi.fn(),
        saveStaged: vi.fn(),
        hasStaged: () => false,
        runShortcut: vi.fn(() => false),
        cancel: vi.fn(),
      }),
    );
    stop = () => scope.stop();
    const button = root.querySelector<HTMLElement>("#b")!;
    button.focus();
    button.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "w",
        bubbles: true,
        cancelable: true,
      }),
    );
    return setView.mock.calls;
  }

  it("W opens the view named week, a week of room columns, before any other (fails when W ignores a view of another type named week)", () => {
    expect(
      press([
        { id: "rooms", type: "resources" },
        { id: "week", type: "resources" },
      ]),
    ).toEqual([["week"]]);
  });

  it("W still opens a week view of another name (fails when only the id is read)", () => {
    expect(press([{ id: "w2", type: "week" }])).toEqual([["w2"]]);
  });
});
