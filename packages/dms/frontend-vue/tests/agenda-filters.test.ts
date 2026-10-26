/**
 * What the FullAgenda shows and keeps besides its ranges: the legend, the
 * search and the facets with the legend's counts; the state kept in the
 * URL under the component id; the `.ics` export; the options with their
 * defaults; the formats; where a click creates; and the keyboard's focus.
 */
import { describe, expect, it } from "vitest";
import {
  countByCalendar,
  filterByLegend,
  filterBySearchAndFacets,
  filterResources,
  matchesFacets,
  matchesSearch,
} from "../layers/dms-ui/app/build/composables/agenda/agendaFilters";
import {
  agendaUrlEntries,
  readAgendaUrlEvent,
  readAgendaUrlState,
} from "../layers/dms-ui/app/build/composables/agenda/agendaUrlState";
import {
  buildAgendaIcs,
  foldIcsLine,
  agendaIcsFileName,
} from "../layers/dms-ui/app/build/composables/agenda/agendaIcs";
import { resolveAgendaOptions } from "../layers/dms-ui/app/build/composables/agenda/agendaOptions";
import { resolveAgendaViews } from "../layers/dms-ui/app/build/composables/agenda/agendaRange";
import {
  formatAgendaDay,
  formatAgendaDaySpan,
  formatAgendaDuration,
  formatAgendaTime,
} from "../layers/dms-ui/app/build/composables/agenda/agendaFormat";
import {
  newEventPlacement,
  placementOfDays,
  placementOfTarget,
  placementRow,
} from "../layers/dms-ui/app/build/composables/agenda/agendaPlacement";
import { describeOccurrence } from "../layers/dms-ui/app/build/composables/agenda/agendaDescribe";
import { completeChange } from "../layers/dms-ui/app/build/composables/agenda/agendaApply";
import { nextFocusedKey } from "../layers/dms-ui/app/build/composables/agenda/useAgendaShortcuts";
import { buildOccurrences } from "../layers/dms-ui/app/build/composables/agenda/agendaOccurrences";
import { dayStartEpoch } from "../layers/dms-ui/app/build/composables/agenda/agendaTime";
import { agendaBackgroundStyle } from "../layers/dms-ui/app/build/composables/agenda/agendaPaint";
import type { AgendaOccurrence } from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import type {
  AgendaEvent,
  FullAgendaOptions,
} from "../layers/dms-ui/app/types/full-agenda";

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
    expect(countByCalendar(filtered)).toEqual({
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

describe("URL state", () => {
  const defaults = {
    view: "month",
    date: "2026-10-25",
    search: "",
    facets: {},
    hidden: ["archive"],
  };

  it("writes only what differs from the defaults, under the component id", () => {
    expect(
      agendaUrlEntries(
        "team",
        {
          view: "week",
          date: "2026-10-25",
          search: " standup ",
          facets: { room: ["atlas", "cafe"], who: [] },
          hidden: ["archive"],
        },
        defaults,
        ["room", "who"],
      ),
    ).toEqual({
      "team.view": "week",
      "team.date": undefined,
      "team.q": "standup",
      "team.hidden": undefined,
      "team.facet_room": "atlas,cafe",
      "team.facet_who": undefined,
    });
  });

  it("writes an empty hidden list when every calendar is shown against the defaults", () => {
    expect(
      agendaUrlEntries("team", { ...defaults, hidden: [] }, defaults, [])[
        "team.hidden"
      ],
    ).toBe("");
  });

  it("reads its own keys back, refusing a view not offered and a day that is not one", () => {
    const query = {
      "team.view": "week",
      "team.date": "2026-10-05",
      "team.q": "deploy",
      "team.facet_room": "atlas",
      "team.hidden": "",
      "other.view": "day",
      "team.event": "standup@2026-10-21",
    };
    expect(
      readAgendaUrlState(query, "team", defaults, ["month", "week"], ["room"]),
    ).toEqual({
      view: "week",
      date: "2026-10-05",
      search: "deploy",
      facets: { room: ["atlas"] },
      hidden: [],
    });
    expect(
      readAgendaUrlState(
        { "team.view": "year", "team.date": "2026-02-30" },
        "team",
        defaults,
        ["month"],
        [],
      ),
    ).toMatchObject({ view: "month", date: "2026-10-25", hidden: ["archive"] });
    expect(readAgendaUrlEvent(query, "team")).toBe("standup@2026-10-21");
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

describe("options", () => {
  const view = (raw: FullAgendaOptions, type = "week" as const) =>
    resolveAgendaViews([type], raw, () => type)[0]!;
  const resolve = (raw: FullAgendaOptions, type?: "week" | "timeline") =>
    resolveAgendaOptions(raw, view(raw, type), {
      timeZone: "America/New_York",
      weekStartsOn: 0,
    });

  it("allows editing only with a saveUrl", () => {
    expect(resolve({ editable: true })).toMatchObject({
      editable: false,
      dragMove: false,
      canCreate: false,
    });
    expect(resolve({ saveUrl: "/save" })).toMatchObject({
      editable: true,
      dragMove: true,
      dragResize: true,
      canCreate: true,
      createTrigger: "click",
    });
    expect(
      resolve({ saveUrl: "/save", dragResize: false, create: false }),
    ).toMatchObject({
      dragResize: false,
      canCreate: false,
    });
  });

  it("creates with a double click in a timeline, and takes the reader's zone and week", () => {
    expect(resolve({ saveUrl: "/s" }, "timeline").createTrigger).toBe(
      "doubleClick",
    );
    expect(resolve({})).toMatchObject({
      timeZone: "America/New_York",
      weekStartsOn: 0,
    });
    expect(
      resolve({ timeZone: "Europe/Brussels", weekStartsOn: 6 }),
    ).toMatchObject({
      timeZone: "Europe/Brussels",
      weekStartsOn: 6,
    });
    expect(resolve({ timeZone: "Mars/Olympus" }).timeZone).toBe(
      "America/New_York",
    );
  });

  it("opens time grids at 08:00, or dayStart when later", () => {
    expect(resolve({}).scrollMinutes).toBe(480);
    expect(resolve({ dayStart: "09:30" })).toMatchObject({
      dayStartMinutes: 570,
      scrollMinutes: 570,
    });
    expect(resolve({ dayStart: "07:00", dayEnd: "21:00" })).toMatchObject({
      dayEndMinutes: 1260,
      scrollMinutes: 480,
    });
  });
});

describe("formats", () => {
  const settings = {
    locale: "en-GB",
    timeZone: BRUSSELS,
    hourCycle: "h23" as const,
  };

  it("writes times in the agenda's zone on the reader's clock", () => {
    const epoch = Date.parse("2026-10-25T08:30:00Z");
    expect(formatAgendaTime(epoch, settings)).toBe("09:30");
    expect(
      formatAgendaTime(epoch, { ...settings, timeZone: "America/New_York" }),
    ).toBe("04:30");
    expect(
      formatAgendaTime(epoch, {
        ...settings,
        locale: "en-US",
        hourCycle: "h12",
      }),
    ).toMatch(/^9:30\s?AM$/);
  });

  it("writes days, spans and lengths", () => {
    expect(formatAgendaDay("2026-10-25", "long", "en-GB")).toMatch(
      /^Sunday,? 25 October 2026$/,
    );
    expect(formatAgendaDay("2026-10-25", "long", "fr-FR")).toBe(
      "dimanche 25 octobre 2026",
    );
    expect(formatAgendaDay("2026-10-25", "short", "en-GB")).toBe("Sun 25");
    expect(formatAgendaDaySpan("2026-09-28", "2026-10-04", "en-GB")).toMatch(
      /^28 Sept?\s–\s4 Oct 2026$/,
    );
    expect(formatAgendaDuration(45)).toBe("45 min");
    expect(formatAgendaDuration(120)).toBe("2 h");
    expect(formatAgendaDuration(90)).toBe("1 h 30");
  });
});

describe("placements", () => {
  const options = resolveAgendaOptions(
    {
      saveUrl: "/s",
      slots: [{ id: "S3", label: "S3", start: "13:00", end: "15:00" }],
      defaultDurationMinutes: 45,
    },
    resolveAgendaViews(["week"], {}, () => "Week")[0]!,
    { timeZone: BRUSSELS, weekStartsOn: 1 },
  );

  it("creates on a time with the default length, on a slot, or on a whole day", () => {
    const timed = placementOfTarget(
      { day: "2026-10-25", minutes: 600, resourceId: "anna" },
      options,
    );
    expect(timed).toEqual({
      start: Date.parse("2026-10-25T09:00:00Z"),
      end: Date.parse("2026-10-25T09:45:00Z"),
      allDay: false,
      resourceIds: ["anna"],
    });
    expect(
      placementOfTarget({ day: "2026-10-26", slotIndex: 0 }, options),
    ).toMatchObject({
      start: Date.parse("2026-10-26T12:00:00Z"),
      end: Date.parse("2026-10-26T14:00:00Z"),
    });
    expect(
      placementOfTarget({ day: "2026-10-25", allDay: true }, options),
    ).toMatchObject({
      allDay: true,
      start: Date.parse("2026-10-24T22:00:00Z"),
      end: Date.parse("2026-10-25T23:00:00Z"),
    });
  });

  it("puts two clicked days in order, and gives selectAction days, the last inclusive", () => {
    const range = placementOfDays(
      { day: "2026-10-30" },
      { day: "2026-10-26" },
      BRUSSELS,
    );
    expect(placementRow(range, BRUSSELS)).toEqual({
      from: "2026-10-26",
      to: "2026-10-30",
      allDay: true,
      resourceId: undefined,
      resourceIds: [],
    });
  });

  it("starts a new event at the next hour today, else at 09:00 on the range's first day", () => {
    const now = Date.parse("2026-10-25T13:20:00Z");
    expect(
      newEventPlacement(
        { from: "2026-10-19", to: "2026-10-25" },
        "2026-10-25",
        now,
        options,
      ).start,
    ).toBe(Date.parse("2026-10-25T14:00:00Z"));
    expect(
      newEventPlacement(
        { from: "2026-11-02", to: "2026-11-08" },
        "2026-10-25",
        now,
        options,
      ).start,
    ).toBe(Date.parse("2026-11-02T08:00:00Z"));
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
    t: (key: string, params: Record<string, unknown> = {}) =>
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

describe("backgrounds", () => {
  it("hatches a closed day and tints a holiday", () => {
    expect(
      agendaBackgroundStyle({ start: "2026-10-25", kind: "closed" })
        .backgroundImage,
    ).toContain("repeating-linear-gradient");
    const holiday = agendaBackgroundStyle({
      start: "2026-11-01",
      kind: "holiday",
    });
    expect(holiday.backgroundImage).toContain("var(--ui-warning)");
    expect(holiday.backgroundImage).not.toContain("repeating");
  });
});
