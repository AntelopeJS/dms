/**
 * What the FullAgenda shows and keeps besides its ranges: the legend, the
 * search and the facets with the legend's counts; the state kept in the
 * URL under the component id; the `.ics` export; the options with their
 * defaults; the formats; where a click creates; and the keyboard's focus.
 */
import type { NamedValue } from "vue-i18n";
import { describe, expect, it } from "vitest";
import {
  countByCalendar,
  filterByLegend,
  filterBySearchAndFacets,
  filterResources,
  matchesFacets,
  matchesSearch,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaFilters";
import {
  buildAgendaIcs,
  foldIcsLine,
  agendaIcsFileName,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaIcs";
import {
  formatAgendaDay,
  formatAgendaTime,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaFormat";
import { describeOccurrence } from "../layers/dms-ui/app/entries/composables/agenda/agendaDescribe";
import { completeChange } from "../layers/dms-ui/app/entries/composables/agenda/agendaApply";
import { nextFocusedKey } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaShortcuts";
import { buildOccurrences } from "../layers/dms-ui/app/entries/composables/agenda/agendaOccurrences";
import { dayStartEpoch } from "../layers/dms-ui/app/entries/composables/agenda/agendaTime";
import type { AgendaOccurrence } from "../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import type { AgendaEvent } from "../layers/dms-ui/app/types/full-agenda";

const BRUSSELS = "Europe/Brussels";

const events: AgendaEvent[] = [
  {
    id: "a",
    title: "Sprint planning",
    start: "2026-10-20T09:00:00+02:00",
    calendarId: "product",
    location: "Salle Atlas",
    data: { room: "atlas", tags: ["sprint", "team"] },
  },
  {
    id: "b",
    title: "Déjeuner équipe",
    start: "2026-10-21T12:00:00+02:00",
    calendarId: "design",
    description: "<p>Chez <b>Mario</b></p>",
    data: { room: "cafe" },
  },
  {
    id: "c",
    title: "Deploy window",
    start: "2026-10-22T18:00:00+02:00",
    calendarId: "engineering",
    resourceIds: ["anna"],
  },
  { id: "d", title: "No calendar", start: "2026-10-23T10:00:00+02:00" },
];

const occurrences = buildOccurrences(events, {
  timeZone: BRUSSELS,
  from: "2026-10-19",
  to: "2026-10-25",
  start: dayStartEpoch("2026-10-19", BRUSSELS),
  end: dayStartEpoch("2026-10-26", BRUSSELS),
  defaultDurationMinutes: 60,
  editable: true,
  dragMove: true,
  dragResize: true,
  detailsContainer: "drawer",
  calendars: new Map(),
  resources: new Map(),
});

const keys = (list: AgendaOccurrence[]) => list.map((entry) => entry.key);

describe("search and facets", () => {
  it("matches every word in titles, places and descriptions, accents and tags aside", () => {
    expect(matchesSearch(events[1]!, "dejeuner mario")).toBe(true);
    expect(matchesSearch(events[0]!, "atlas sprint")).toBe(true);
    expect(matchesSearch(events[0]!, "sprint mario")).toBe(false);
    expect(matchesSearch(events[1]!, "   ")).toBe(true);
  });

  it("reads a facet on an event field or its data, OR within a facet, AND across", () => {
    const facets = [
      { id: "room", label: "Room", field: "room", options: [] },
      { id: "cal", label: "Calendar", field: "calendarId", options: [] },
      { id: "tag", label: "Tag", field: "tags", options: [] },
    ];
    expect(matchesFacets(events[0]!, facets, { room: ["atlas", "cafe"] })).toBe(
      true,
    );
    expect(
      matchesFacets(events[0]!, facets, { room: ["atlas"], cal: ["design"] }),
    ).toBe(false);
    expect(matchesFacets(events[0]!, facets, { tag: ["team"] })).toBe(true);
    expect(matchesFacets(events[3]!, facets, { room: ["atlas"] })).toBe(false);
  });

  it("counts per calendar before the legend hides any, then hides", () => {
    const filtered = filterBySearchAndFacets(occurrences, {
      search: "",
      facets: [],
      facetValues: {},
      hiddenCalendars: new Set(["design"]),
    });
    expect(Object.fromEntries(countByCalendar(filtered))).toEqual({
      product: 1,
      design: 1,
      engineering: 1,
    });
    expect(keys(filterByLegend(filtered, new Set(["design"])))).toEqual([
      "a",
      "c",
      "d",
    ]);
  });

  it("keeps the resources a facet over resourceIds picks", () => {
    const resources = [
      { id: "anna", label: "Anna" },
      { id: "bob", label: "Bob" },
    ];
    const facets = [
      { id: "who", label: "Who", field: "resourceIds", options: [] },
    ];
    expect(filterResources(resources, facets, { who: ["bob"] })).toEqual([
      { id: "bob", label: "Bob" },
    ]);
    expect(filterResources(resources, facets, {})).toHaveLength(2);
  });
});

describe("ICS export", () => {
  it("writes timed events in UTC and all-day ones as dates with an exclusive end", () => {
    const [timed] = buildOccurrences(
      [
        {
          id: "x",
          title: "Review; plan, ship",
          start: "2026-10-25T09:00:00+01:00",
          end: "2026-10-25T10:00:00+01:00",
          location: "Room 1",
          status: "tentative",
        },
      ],
      {
        timeZone: BRUSSELS,
        from: "2026-10-25",
        to: "2026-10-25",
        start: dayStartEpoch("2026-10-25", BRUSSELS),
        end: dayStartEpoch("2026-10-26", BRUSSELS),
        defaultDurationMinutes: 60,
        editable: false,
        dragMove: false,
        dragResize: false,
        detailsContainer: "drawer",
        calendars: new Map(),
        resources: new Map(),
      },
    );
    const allDay = {
      ...timed!,
      key: "leave",
      allDay: true,
      startDay: "2026-10-26",
      endDay: "2026-10-30",
      event: { id: "leave", title: "Leave", start: "2026-10-26" },
    };
    const text = buildAgendaIcs([timed!, allDay], {
      name: "Team",
      now: Date.parse("2026-10-25T12:00:00Z"),
      calendarLabel: () => "Design",
    });
    expect(text).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
    expect(text).toContain(
      "DTSTART:20261025T080000Z\r\nDTEND:20261025T090000Z",
    );
    expect(text).toContain("SUMMARY:Review\\; plan\\, ship");
    expect(text).toContain("STATUS:TENTATIVE");
    expect(text).toContain(
      "DTSTART;VALUE=DATE:20261026\r\nDTEND;VALUE=DATE:20261031",
    );
    expect(text).toContain("CATEGORIES:Design");
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("folds long lines at 75 octets and names the file after the range", () => {
    const folded = foldIcsLine(`SUMMARY:${"é".repeat(60)}`);
    for (const line of folded.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(
      agendaIcsFileName("Calendrier d'équipe", "2026-10-19", "2026-10-25"),
    ).toBe("calendrier-d-equipe-2026-10-19-2026-10-25.ics");
  });
});

describe("changes completed", () => {
  const series: AgendaEvent = {
    id: "s",
    title: "Standup",
    start: "2026-10-19T09:00:00+02:00",
    end: "2026-10-19T09:15:00+02:00",
    recurrence: { frequency: "daily" },
  };
  const [, occurrence] = buildOccurrences([series], {
    timeZone: BRUSSELS,
    from: "2026-10-19",
    to: "2026-10-26",
    start: dayStartEpoch("2026-10-19", BRUSSELS),
    end: dayStartEpoch("2026-10-27", BRUSSELS),
    defaultDurationMinutes: 60,
    editable: true,
    dragMove: true,
    dragResize: true,
    detailsContainer: "drawer",
    calendars: new Map(),
    resources: new Map(),
  });

  it("gives an occurrence's change its own times as previous, not the series'", () => {
    const change = completeChange({
      change: {
        kind: "move",
        id: "s",
        occurrence: "2026-10-20",
        patch: {
          start: "2026-10-20T10:00:00+02:00",
          end: "2026-10-20T10:15:00+02:00",
        },
        previous: { start: series.start, end: series.end },
      },
      occurrence,
      scope: "occurrence",
      timeZone: BRUSSELS,
    });
    expect(change).toMatchObject({
      scope: "occurrence",
      previous: {
        start: "2026-10-20T09:00:00+02:00",
        end: "2026-10-20T09:15:00+02:00",
      },
    });
  });

  it("gives a new event a tempId, and a delete every field as it was", () => {
    expect(
      completeChange({
        change: { kind: "create", patch: {} },
        timeZone: BRUSSELS,
      }).tempId,
    ).toMatch(/^tmp-/);
    expect(
      completeChange({
        change: { kind: "delete", id: "a" },
        event: events[0],
        timeZone: BRUSSELS,
      }).previous,
    ).toMatchObject({
      title: "Sprint planning",
      calendarId: "product",
      location: "Salle Atlas",
    });
  });
});

describe("accessibility and keyboard", () => {
  const tools = {
    format: {
      day: (key: string) => formatAgendaDay(key, "long", "en-GB"),
      time: (epoch: number) =>
        formatAgendaTime(epoch, {
          locale: "en-GB",
          timeZone: BRUSSELS,
          hourCycle: "h23" as const,
        }),
    },
    t: (key: string, params: NamedValue = {}) =>
      `${key.split(".").at(-1)}(${Object.values(params).join("|")})`,
    calendarLabel: () => "Product",
  };

  it("describes an event with when it is, its calendar and its state", () => {
    const day = formatAgendaDay("2026-10-20", "long", "en-GB");
    const label = `event_calendar(Sprint planning|timed(${day}|09:00|10:00)|Product)`;
    expect(describeOccurrence(occurrences[0]!, tools)).toBe(label);
    expect(
      describeOccurrence({ ...occurrences[0]!, state: "saving" }, tools),
    ).toBe(`${label}, state_saving()`);
  });

  it("moves the keyboard focus among events, staying within them", () => {
    expect(nextFocusedKey(occurrences, null, 1)).toBe("a");
    expect(nextFocusedKey(occurrences, null, -1)).toBe("d");
    expect(nextFocusedKey(occurrences, "a", 1)).toBe("b");
    expect(nextFocusedKey(occurrences, "d", 1)).toBe("d");
  });
});
