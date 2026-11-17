import { describe, expect, it, vi } from "vitest";
import {
  bookProposal,
  proposalPlacement,
  type AgendaProposeDeps,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaPropose";
import { valuesFromPlacement } from "../layers/dms-ui/app/entries/composables/agenda/agendaForm";
import {
  firstOpenInstant,
  newEventPlacement,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaPlacement";
import { resolveAgendaOptions } from "../layers/dms-ui/app/entries/composables/agenda/agendaOptions";
import { resolveAgendaViews } from "../layers/dms-ui/app/entries/composables/agenda/agendaRange";
import type {
  AgendaBackground,
  AgendaProposal,
} from "../layers/dms-ui/app/types/full-agenda";

const BRUSSELS = "Europe/Brussels";

function deps(read: AgendaProposeDeps["read"]) {
  const calls: string[] = [];
  const full: AgendaProposeDeps = {
    propose: { param: "plan", url: "/api/agenda/proposal" },
    timeZone: BRUSSELS,
    read,
    goTo: vi.fn((day: string) => calls.push(`goTo ${day}`)),
    open: vi.fn(() => calls.push("open")),
    toast: vi.fn((_, tone) => calls.push(`toast ${tone}`)),
    failedMessage: "failed",
  };
  return { full, calls };
}

const proposal: AgendaProposal = {
  start: "2026-11-12T14:00:00+01:00",
  end: "2026-11-12T14:30:00+01:00",
  resourceIds: ["room-1"],
  calendarId: "visits",
  title: "Check-up",
  data: { guestId: "p1" },
  message: "Proposed Thursday",
};

describe("booking mode", () => {
  it("reads the route with the URL value and the zone, goes to the proposal day, then opens the prefilled form and toasts the message (fails when tz is not sent, the form opens before the move, or the message is lost)", async () => {
    const read = vi.fn().mockResolvedValue(proposal);
    const { full, calls } = deps(read);
    expect(await bookProposal(full, "p1")).toBe(true);
    expect(read).toHaveBeenCalledWith("/api/agenda/proposal", {
      plan: "p1",
      tz: BRUSSELS,
    });
    expect(calls).toEqual(["goTo 2026-11-12", "open", "toast info"]);
    expect(full.open).toHaveBeenCalledWith(
      {
        start: Date.parse("2026-11-12T13:00:00Z"),
        end: Date.parse("2026-11-12T13:30:00Z"),
        allDay: false,
        resourceIds: ["room-1"],
      },
      { calendarId: "visits", title: "Check-up", data: { guestId: "p1" } },
    );
  });

  it("a failed read shows an error toast and moves nothing (fails when the agenda moves or opens a form on error)", async () => {
    const { full, calls } = deps(vi.fn().mockRejectedValue(new Error("500")));
    expect(await bookProposal(full, "p1")).toBe(false);
    expect(calls).toEqual(["toast error"]);
  });

  it("a proposal whose end is not after its start is refused like a failed read (fails when it opens an empty slot)", async () => {
    const { full, calls } = deps(
      vi.fn().mockResolvedValue({ ...proposal, end: proposal.start }),
    );
    expect(await bookProposal(full, "p1")).toBe(false);
    expect(calls).toEqual(["toast error"]);
    expect(proposalPlacement({ ...proposal, start: "soon" })).toBeNull();
  });

  it("the form of a new event opens with the custom fields of the proposal (fails when data is dropped and guestId starts empty)", () => {
    const placement = proposalPlacement(proposal);
    if (!placement) throw new Error("the proposal reads");
    const values = valuesFromPlacement(
      placement,
      [
        {
          id: "guestId",
          label: "Guest",
          kind: "relation",
          options: [],
          required: false,
          readOnly: false,
        },
      ],
      BRUSSELS,
      { title: "Check-up", data: { guestId: "p1" } },
    );
    expect(values.guestId).toBe("p1");
    expect(values.title).toBe("Check-up");
  });
});

describe("the default time of a new event", () => {
  const options = resolveAgendaOptions(
    { saveUrl: "/s" },
    resolveAgendaViews(["week"], {}, () => "Week")[0]!,
    { timeZone: BRUSSELS, weekStartsOn: 1 },
  );
  const range = { from: "2026-11-02", to: "2026-11-08" };
  const closed = (
    start: string,
    end: string,
    extra: Partial<AgendaBackground> = {},
  ): AgendaBackground => ({
    start: `2026-11-02T${start}:00+01:00`,
    end: `2026-11-02T${end}:00+01:00`,
    kind: "closed",
    ...extra,
  });
  const startOf = (backgrounds: AgendaBackground[], ids = ["a"]) =>
    newEventPlacement(range, "2026-10-25", 0, options, {
      resourceIds: ids,
      backgrounds,
    }).start;
  const closedToMidnight: AgendaBackground = {
    start: "2026-11-02T00:00:00+01:00",
    end: "2026-11-03T00:00:00+01:00",
    kind: "closed",
  };
  const NINE = Date.parse("2026-11-02T08:00:00Z");

  it("moves from 09:00 to the end of the closed zone (fails when it opens in the hatched zone)", () => {
    expect(startOf([closed("00:00", "10:00")])).toBe(
      Date.parse("2026-11-02T09:00:00Z"),
    );
  });

  it("follows chained closed zones to the first open minute (fails when it stops at the first zone end)", () => {
    expect(startOf([closed("09:00", "10:00"), closed("10:00", "11:00")])).toBe(
      Date.parse("2026-11-02T10:00:00Z"),
    );
  });

  it("stays at 09:00 when another shown resource is open, and when the closed zone belongs to a resource not shown (fails when one closed room closes the agenda)", () => {
    const roomA = closed("00:00", "10:00", { resourceIds: ["a"] });
    expect(startOf([roomA], ["a", "b"])).toBe(NINE);
    expect(startOf([roomA], ["b"])).toBe(NINE);
  });

  it("ignores all-day and non-closed shading, and keeps its candidate when the rest of the day is closed (fails when a holiday blocks it or it picks a time past closing)", () => {
    expect(
      startOf([
        closed("00:00", "10:00", { kind: "holiday" }),
        { start: "2026-11-02", end: "2026-11-02", kind: "closed" },
      ]),
    ).toBe(NINE);
    expect(startOf([closedToMidnight])).toBe(NINE);
    expect(
      firstOpenInstant("2026-11-02", 540, BRUSSELS, {
        resourceIds: [],
        backgrounds: [closedToMidnight],
      }),
    ).toBeNull();
  });
});
