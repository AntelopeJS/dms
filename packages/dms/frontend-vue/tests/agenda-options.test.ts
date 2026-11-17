/**
 * What the FullAgenda keeps and reads besides its events: the state kept in
 * the URL under the component id, the options with their defaults, the
 * formats, where a click creates, and the backgrounds of a range.
 */
import { describe, expect, it } from "vitest";
import {
  agendaUrlEntries,
  readAgendaUrlEvent,
  readAgendaUrlState,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaUrlState";
import { resolveAgendaOptions } from "../layers/dms-ui/app/entries/composables/agenda/agendaOptions";
import { resolveAgendaViews } from "../layers/dms-ui/app/entries/composables/agenda/agendaRange";
import {
  formatAgendaDay,
  formatAgendaDaySpan,
  formatAgendaDuration,
  formatAgendaTime,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaFormat";
import {
  newEventPlacement,
  placementOfDays,
  placementOfTarget,
  placementRow,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaPlacement";
import { agendaBackgroundStyle } from "../layers/dms-ui/app/entries/composables/agenda/agendaPaint";
import type { FullAgendaOptions } from "../layers/dms-ui/app/types/full-agenda";
import { BRUSSELS } from "./fixtures/agendaOccurrences";

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

describe("options", () => {
  const view = (raw: FullAgendaOptions, type: "week" | "timeline" = "week") =>
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
