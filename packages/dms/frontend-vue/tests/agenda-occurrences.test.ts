/**
 * Events normalized into the occurrences the views draw: default ends,
 * all-day ends inclusive, timed ends at midnight, DST days, another zone,
 * paint, permissions merged from the block, the calendar, the resources
 * and the event, hidden days, and changes not written shown with ghosts.
 */
import { describe, expect, it } from "vitest";
import {
  buildOccurrences,
  type AgendaNormalizeSettings,
} from "../layers/dms-ui/app/build/composables/agenda/agendaOccurrences";
import { agendaPaint } from "../layers/dms-ui/app/build/composables/agenda/agendaPaint";
import { overlayEdits } from "../layers/dms-ui/app/build/composables/agenda/agendaChanges";
import { dayStartEpoch } from "../layers/dms-ui/app/build/composables/agenda/agendaTime";
import type {
  AgendaCalendar,
  AgendaEvent,
  AgendaResource,
} from "../layers/dms-ui/app/types/full-agenda";

const BRUSSELS = "Europe/Brussels";
const NEW_YORK = "America/New_York";

function settingsFor(
  from: string,
  to: string,
  overrides: Partial<AgendaNormalizeSettings> = {},
): AgendaNormalizeSettings {
  const timeZone = overrides.timeZone ?? BRUSSELS;
  const next = new Date(Date.parse(to) + 86_400_000).toISOString().slice(0, 10);
  return {
    timeZone,
    from,
    to,
    start: dayStartEpoch(from, timeZone),
    end: dayStartEpoch(next, timeZone),
    defaultDurationMinutes: 60,
    editable: true,
    dragMove: true,
    dragResize: true,
    detailsContainer: "drawer",
    calendars: new Map(),
    resources: new Map(),
    ...overrides,
  };
}

const event = (fields: Partial<AgendaEvent> & { id: string }): AgendaEvent => ({
  title: fields.id,
  start: "2026-10-25T10:00:00+01:00",
  ...fields,
});

describe("bounds", () => {
  it("ends a timed event without an end after the default duration", () => {
    const [occurrence] = buildOccurrences(
      [event({ id: "a" })],
      settingsFor("2026-10-25", "2026-10-25"),
    );
    expect(occurrence!.end - occurrence!.start).toBe(3_600_000);
    expect(occurrence!.startMinutes).toBe(600);
    expect(occurrence!.endMinutes).toBe(660);
  });

  it("draws an event of the repeated hour on the DST day at its wall-clock time", () => {
    const [occurrence] = buildOccurrences(
      [
        event({
          id: "night",
          start: "2026-10-25T02:30:00+01:00",
          end: "2026-10-25T03:30:00+01:00",
        }),
      ],
      settingsFor("2026-10-25", "2026-10-25"),
    );
    expect(occurrence!.startMinutes).toBe(150);
    expect(occurrence!.endMinutes).toBe(210);
    expect(occurrence!.startDay).toBe("2026-10-25");
  });

  it("ends a timed event at midnight on the day before", () => {
    const [occurrence] = buildOccurrences(
      [
        event({
          id: "late",
          start: "2026-10-25T22:00:00+01:00",
          end: "2026-10-26T00:00:00+01:00",
        }),
      ],
      settingsFor("2026-10-25", "2026-10-26"),
    );
    expect(occurrence!.endDay).toBe("2026-10-25");
    expect(occurrence!.endMinutes).toBe(1440);
  });

  it("covers an all-day event's last day, inclusive, over a DST change", () => {
    const [occurrence] = buildOccurrences(
      [
        event({
          id: "leave",
          start: "2026-10-24",
          end: "2026-10-26",
          allDay: true,
        }),
      ],
      settingsFor("2026-10-19", "2026-10-31"),
    );
    expect(occurrence!.allDay).toBe(true);
    expect(occurrence!.startDay).toBe("2026-10-24");
    expect(occurrence!.endDay).toBe("2026-10-26");
    expect(occurrence!.end - occurrence!.start).toBe(73 * 3_600_000);
  });

  it("reads a bare day as an all-day event", () => {
    const [occurrence] = buildOccurrences(
      [event({ id: "holiday", start: "2026-11-01" })],
      settingsFor("2026-11-01", "2026-11-01"),
    );
    expect(occurrence!.allDay).toBe(true);
    expect(occurrence!.endDay).toBe("2026-11-01");
  });

  it("draws an instant in another zone on that zone's day and time", () => {
    const [occurrence] = buildOccurrences(
      [
        event({
          id: "call",
          start: "2026-10-25T03:30:00Z",
          end: "2026-10-25T04:30:00Z",
        }),
      ],
      settingsFor("2026-10-24", "2026-10-24", { timeZone: NEW_YORK }),
    );
    expect(occurrence!.startDay).toBe("2026-10-24");
    expect(occurrence!.startMinutes).toBe(23 * 60 + 30);
    expect(occurrence!.endDay).toBe("2026-10-25");
    expect(occurrence!.endMinutes).toBe(30);
  });

  it("leaves out events outside the range and on hidden days only", () => {
    const events = [
      event({ id: "in", start: "2026-10-23T10:00:00+02:00" }),
      event({ id: "sunday", start: "2026-10-25T10:00:00+01:00" }),
      event({ id: "out", start: "2026-11-02T10:00:00+01:00" }),
      event({
        id: "weekend",
        start: "2026-10-24",
        end: "2026-10-26",
        allDay: true,
      }),
    ];
    const shownDays = new Set([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
    ]);
    const keys = buildOccurrences(
      events,
      settingsFor("2026-10-19", "2026-10-25", { shownDays }),
    ).map((occurrence) => occurrence.key);
    expect(keys).toEqual(["in"]);
  });

  it("puts all-day events first, then by start, the longer first", () => {
    const keys = buildOccurrences(
      [
        event({
          id: "short",
          start: "2026-10-25T09:00:00+01:00",
          end: "2026-10-25T09:30:00+01:00",
        }),
        event({
          id: "long",
          start: "2026-10-25T09:00:00+01:00",
          end: "2026-10-25T11:00:00+01:00",
        }),
        event({ id: "day", start: "2026-10-25", allDay: true }),
      ],
      settingsFor("2026-10-25", "2026-10-25"),
    ).map((occurrence) => occurrence.key);
    expect(keys).toEqual(["day", "long", "short"]);
  });
});

describe("paint and permissions", () => {
  const calendars = new Map<string, AgendaCalendar>([
    [
      "design",
      { id: "design", label: "Design", color: "oklch(0.62 0.15 258)" },
    ],
    [
      "locked",
      { id: "locked", label: "Locked", editable: false, details: false },
    ],
  ]);
  const resources = new Map<string, AgendaResource>([
    ["frozen", { id: "frozen", label: "Frozen", editable: false }],
    ["anna", { id: "anna", label: "Anna", color: "success" }],
  ]);
  const settings = settingsFor("2026-10-25", "2026-10-25", {
    calendars,
    resources,
  });
  const only = (
    fields: Partial<AgendaEvent> & { id: string },
    extra = settings,
  ) => buildOccurrences([event(fields)], extra)[0]!;

  it("paints with the event's colour, else its calendar's, else its resource's", () => {
    expect(only({ id: "a", calendarId: "design" }).paint).toEqual(
      agendaPaint("oklch(0.62 0.15 258)"),
    );
    expect(
      only({ id: "b", calendarId: "design", color: "#ff0000" }).paint.bar,
    ).toBe("#ff0000");
    expect(only({ id: "c", resourceIds: ["anna"] }).paint.bar).toBe(
      "var(--ui-success)",
    );
    expect(only({ id: "d" }).paint.background).toBe(
      "color-mix(in oklab, var(--ui-primary) 14%, var(--ui-bg))",
    );
  });

  it("lets the block, the calendar, the resources and the event each forbid", () => {
    expect(only({ id: "free" })).toMatchObject({
      canMove: true,
      canResize: true,
      canDelete: true,
      details: "drawer",
    });
    expect(only({ id: "cal", calendarId: "locked" })).toMatchObject({
      canMove: false,
      canDelete: false,
      details: false,
    });
    expect(only({ id: "res", resourceIds: ["anna", "frozen"] }).canMove).toBe(
      false,
    );
    expect(only({ id: "own", editable: false }).canResize).toBe(false);
    expect(only({ id: "start", startEditable: false })).toMatchObject({
      canMove: false,
      canResize: true,
    });
    expect(only({ id: "dur", durationEditable: false })).toMatchObject({
      canMove: true,
      canResize: false,
    });
    expect(only({ id: "keep", deletable: false }).canDelete).toBe(false);
    expect(
      only({ id: "block" }, { ...settings, editable: false }),
    ).toMatchObject({ canMove: false, canResize: false, canDelete: false });
    expect(
      only({ id: "nodrag" }, { ...settings, dragMove: false }).canMove,
    ).toBe(false);
  });

  it("opens where the event says, else its calendar, else the block", () => {
    expect(
      only({ id: "x", details: "modal", calendarId: "locked" }).details,
    ).toBe("modal");
  });
});

describe("changes shown", () => {
  const base = [
    event({
      id: "a",
      start: "2026-10-25T10:00:00+01:00",
      end: "2026-10-25T11:00:00+01:00",
    }),
  ];
  const ghost = {
    start: Date.parse("2026-10-25T09:00:00Z"),
    end: Date.parse("2026-10-25T10:00:00Z"),
    allDay: false,
    resourceIds: [],
  };

  it("draws a staged move at its new place with a ghost at the old one", () => {
    const { events, marks } = overlayEdits(
      base,
      [
        {
          key: "a",
          status: "staged",
          ghost,
          change: {
            kind: "move",
            id: "a",
            patch: {
              start: "2026-10-25T14:00:00+01:00",
              end: "2026-10-25T15:00:00+01:00",
            },
            previous: { start: base[0]!.start, end: base[0]!.end },
          },
        },
      ],
      "staged",
    );
    const [occurrence] = buildOccurrences(
      events,
      settingsFor("2026-10-25", "2026-10-25", { marks }),
    );
    expect(occurrence!.startMinutes).toBe(14 * 60);
    expect(occurrence!.state).toBe("staged");
    expect(occurrence!.ghost).toEqual(ghost);
  });

  it("draws a refused immediate change back where it was, marked", () => {
    const { events, marks } = overlayEdits(
      base,
      [
        {
          key: "a",
          status: "error",
          message: "Refused",
          change: {
            kind: "move",
            id: "a",
            patch: { start: "2026-10-25T14:00:00+01:00" },
          },
        },
      ],
      "immediate",
    );
    const [occurrence] = buildOccurrences(
      events,
      settingsFor("2026-10-25", "2026-10-25", { marks }),
    );
    expect(occurrence!.startMinutes).toBe(600);
    expect(occurrence!.state).toBe("error");
    expect(occurrence!.stateMessage).toBe("Refused");
    expect(occurrence!.ghost).toBeUndefined();
  });

  it("draws an occurrence moved alone apart from its series", () => {
    const series = event({
      id: "s",
      start: "2026-10-19T09:00:00+02:00",
      end: "2026-10-19T09:15:00+02:00",
      recurrence: { frequency: "daily" },
    });
    const { events, marks } = overlayEdits(
      [series],
      [
        {
          key: "s@2026-10-21",
          status: "saving",
          change: {
            kind: "move",
            id: "s",
            scope: "occurrence",
            occurrence: "2026-10-21",
            patch: {
              start: "2026-10-21T15:00:00+02:00",
              end: "2026-10-21T15:15:00+02:00",
            },
          },
        },
      ],
      "immediate",
    );
    const occurrences = buildOccurrences(
      events,
      settingsFor("2026-10-20", "2026-10-22", { marks }),
    );
    expect(
      occurrences.map((occurrence) => [
        occurrence.key,
        occurrence.startMinutes,
        occurrence.state,
      ]),
    ).toEqual([
      ["s@2026-10-20", 540, undefined],
      ["s@2026-10-21", 900, "saving"],
      ["s@2026-10-22", 540, undefined],
    ]);
  });
});
