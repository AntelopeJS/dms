/**
 * The FullAgenda save engine, its answers: `tempId`s replaced by the answered
 * events, the answered lists replacing the block's, and what it reads.
 */
import { describe, expect, it } from "vitest";
import { overlayPending } from "../layers/dms-ui/app/build/composables/agenda/agendaChanges";
import {
  agendaFetchQuery,
  applySaveAnswer,
  leavesLocalId,
  mergeById,
} from "../layers/dms-ui/app/build/composables/agenda/agendaData";
import type { AgendaData } from "../layers/dms-ui/app/types/full-agenda";
import { move } from "./helpers/agenda-save-harness";

describe("answers", () => {
  const data: AgendaData = {
    events: [
      { id: "a", title: "A", start: "2026-10-20T09:00:00+02:00" },
      { id: "tmp-1", title: "New", start: "2026-10-21T09:00:00+02:00" },
    ],
    unscheduled: [
      { id: "p1", title: "Client 1" },
      { id: "p2", title: "Client 2" },
    ],
    notices: [{ message: "Old" }],
  };

  it("puts the answered events in place of their temp ids, and the lists in place of the block's", () => {
    const next = applySaveAnswer(
      data,
      {
        events: [
          {
            id: "ev-1",
            tempId: "tmp-1",
            title: "New",
            start: "2026-10-21T09:00:00+02:00",
          },
        ],
        notices: [{ message: "New notice", tone: "error" }],
        backgrounds: [{ start: "2026-10-22", kind: "closed" }],
        unscheduled: [],
      },
      [{ kind: "create", tempId: "tmp-1", patch: { title: "New" } }],
    );
    expect(next.events.map((event) => event.id)).toEqual(["a", "ev-1"]);
    expect(next.events[1]).not.toHaveProperty("tempId");
    expect(next.notices).toEqual([{ message: "New notice", tone: "error" }]);
    expect(next.backgrounds).toHaveLength(1);
    expect(next.unscheduled).toEqual([]);
  });

  it("applies as sent a change the answer does not show, and removes what it removed", () => {
    const next = applySaveAnswer(data, { removed: ["tmp-1"] }, [
      move("a", "2026-10-22T09:00:00+02:00"),
    ]);
    expect(next.events).toEqual([
      { id: "a", title: "A", start: "2026-10-22T09:00:00+02:00" },
    ]);
  });

  it("takes a scheduled item out of the pending ones, and gives an unscheduled event back", () => {
    const scheduled = applySaveAnswer(
      data,
      {},
      [
        {
          kind: "schedule",
          id: "p1",
          tempId: "new-p1",
          patch: { start: "2026-10-23T08:00:00+02:00" },
        },
      ],
      () => ({ id: "new-p1", title: "Client 1", start: "" }),
    );
    expect(scheduled.unscheduled!.map((item) => item.id)).toEqual(["p2"]);
    expect(scheduled.events.at(-1)).toMatchObject({
      id: "new-p1",
      title: "Client 1",
    });
    const unscheduled = applySaveAnswer(data, {}, [
      { kind: "unschedule", id: "a" },
    ]);
    expect(unscheduled.unscheduled!.map((item) => item.id)).toEqual([
      "p1",
      "p2",
      "a",
    ]);
    expect(unscheduled.events.map((event) => event.id)).toEqual(["tmp-1"]);
  });

  it("reads again when a change leaves an id the route never named", () => {
    expect(
      leavesLocalId({}, [{ kind: "create", tempId: "t", patch: {} }]),
    ).toBe(true);
    expect(
      leavesLocalId(
        { events: [{ id: "e", tempId: "t", title: "", start: "" }] },
        [{ kind: "create", tempId: "t", patch: {} }],
      ),
    ).toBe(false);
    expect(leavesLocalId({}, [move("a", "x")])).toBe(false);
  });

  it("shows the pending items a staged schedule takes and an unschedule gives back", () => {
    const items = overlayPending(
      data.unscheduled!,
      [
        {
          key: "new-p1",
          status: "staged",
          change: { kind: "schedule", id: "p1", tempId: "new-p1" },
        },
        {
          key: "a",
          status: "staged",
          base: data.events[0],
          change: { kind: "unschedule", id: "a" },
        },
      ],
      "staged",
    );
    expect(items.map((item) => item.id)).toEqual(["p2", "a"]);
  });
});

describe("reading", () => {
  it("asks the route for the range, view, zone, search, shown calendars and facets", () => {
    expect(
      agendaFetchQuery({
        range: { from: "2026-10-19", to: "2026-10-25" },
        viewId: "week",
        timeZone: "Europe/Brussels",
        search: "  standup ",
        facetValues: { room: ["A", "B"], empty: [] },
        calendars: ["design", "product"],
      }),
    ).toEqual({
      from: "2026-10-19",
      to: "2026-10-25",
      view: "week",
      tz: "Europe/Brussels",
      q: "standup",
      calendars: "design,product",
      facet_room: "A,B",
    });
  });

  it("merges the block's calendars with the answer's, the answer winning", () => {
    expect(
      mergeById(
        [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        [
          { id: "b", label: "B2" },
          { id: "c", label: "C" },
        ],
      ),
    ).toEqual([
      { id: "a", label: "A" },
      { id: "b", label: "B2" },
      { id: "c", label: "C" },
    ]);
  });
});
