/** @vitest-environment jsdom */
import { occurrenceStub } from "./fixtures/agendaFakeContext";
import { effectScope, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  shortcutAction,
  useAgendaShortcuts,
} from "../layers/dms-ui/app/entries/composables/agenda/useAgendaShortcuts";
import type { AgendaEventAction } from "../layers/dms-ui/app/types/full-agenda";

const INVOICE: AgendaEventAction = {
  id: "invoice",
  label: "Invoice",
  shortcut: "K",
  visibleWhen: { field: "invoiceOffered", in: [true] },
  target: { type: "page", url: "/guests/{{row.guestId}}/invoice" },
};
const STATUS: AgendaEventAction = {
  id: "arrived",
  label: "Arrived",
  target: { type: "page", url: "/" },
};

describe("the event action a Shift+letter runs", () => {
  it("is the one whose letter, written in capitals, matches the key, only where it is offered (fails when Shift+K invoices a booking the viewer may not invoice)", () => {
    const actions = [STATUS, INVOICE];
    expect([
      shortcutAction(actions, "k", { invoiceOffered: true })?.id,
      shortcutAction(actions, "k", { invoiceOffered: false }),
      shortcutAction(actions, "s", { invoiceOffered: true }),
    ]).toEqual(["invoice", undefined, undefined]);
  });
});

describe("Shift+K on a focused booking", () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    document.body.innerHTML = "";
  });

  function mount() {
    document.body.innerHTML = `
      <div data-dms-agenda>
        <button id="today">Today</button>
        <button data-agenda-occurrence="a">A</button>
      </div>`;
    const root = document.querySelector<HTMLElement>("[data-dms-agenda]")!;
    const occurrences = [occurrenceStub({ key: "a", canDelete: false })];
    const calls = { runShortcut: vi.fn(() => true), goToday: vi.fn() };
    const scope = effectScope();
    scope.run(() =>
      useAgendaShortcuts({
        root: ref(root),
        enabled: () => true,
        isStaged: () => false,
        views: () => [],
        occurrences: () => occurrences,
        focusedKey: ref<string | null>(null),
        goToday: calls.goToday,
        go: vi.fn(),
        setView: vi.fn(),
        createNew: vi.fn(),
        open: vi.fn(),
        remove: vi.fn(),
        saveStaged: vi.fn(),
        hasStaged: () => false,
        runShortcut: calls.runShortcut,
        cancel: vi.fn(),
      }),
    );
    stop = () => scope.stop();
    const press = (target: Element, key: string, shiftKey: boolean) =>
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    const chip = root.querySelector<HTMLElement>(
      '[data-agenda-occurrence="a"]',
    )!;
    return { root, chip, calls, press };
  }

  it("runs the action of that letter on the booking the focus is on, and K alone or Shift+K off a booking runs nothing (fails when the key is not read, or fires without a focused booking)", () => {
    const { root, chip, calls, press } = mount();
    chip.focus();
    press(chip, "K", true);
    press(chip, "k", false);
    const today = root.querySelector<HTMLElement>("#today")!;
    today.focus();
    press(today, "K", true);

    expect(calls.runShortcut.mock.calls).toEqual([
      ["k", expect.objectContaining({ key: "a" })],
    ]);
  });

  it("leaves the agenda's own Shift+T to today on a focused booking (fails when an action letter takes over a built-in key)", () => {
    const { chip, calls, press } = mount();
    chip.focus();
    press(chip, "T", true);

    expect([
      calls.goToday.mock.calls.length,
      calls.runShortcut.mock.calls,
    ]).toEqual([1, []]);
  });
});
