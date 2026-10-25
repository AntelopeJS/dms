/**
 * The details form of a FullAgenda as data: its fields (built-in ones by
 * default, a list that names one is the whole form), the values it opens
 * with on an occurrence or a placement in the agenda's zone (a DST day
 * included), what it refuses, and the change it saves.
 */
import { describe, expect, it } from "vitest";
import {
  agendaActionRow,
  buildPatch,
  createChange,
  deleteChange,
  isFieldShown,
  resolveFormFields,
  updateChange,
  validateForm,
  valuesFromOccurrence,
  valuesFromPlacement,
  type AgendaFormSources,
} from "../layers/dms-ui/app/build/composables/agenda/agendaForm";
import {
  wallClockEpoch,
  wallClockIso,
  wallClockOf,
} from "../layers/dms-ui/app/build/composables/agenda/agendaFormTime";
import type { AgendaOccurrence } from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import type { AgendaEvent } from "../layers/dms-ui/app/types/full-agenda";

const BRUSSELS = "Europe/Brussels";
const TOKYO = "Asia/Tokyo";

const SOURCES: AgendaFormSources = {
  calendars: [{ id: "design", label: "Design" }],
  resources: [],
  text: String,
};

function occurrence(
  event: AgendaEvent,
  overrides: Partial<AgendaOccurrence> = {},
): AgendaOccurrence {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end ?? event.start);
  return {
    key: event.id,
    event,
    allDay: false,
    start,
    end,
    startDay: event.start.slice(0, 10),
    endDay: (event.end ?? event.start).slice(0, 10),
    startMinutes: 0,
    endMinutes: 0,
    resourceIds: event.resourceIds ?? [],
    paint: { background: "", bar: "", text: "", onBar: "" },
    canMove: true,
    canResize: true,
    canDelete: true,
    details: "drawer",
    ...overrides,
  };
}

describe("fields", () => {
  it("takes the built-in fields the agenda uses, then the custom ones", () => {
    const fields = resolveFormFields({
      ...SOURCES,
      fields: [
        { id: "dossier", label: "Dossier", required: true },
        { id: "description", visible: false },
      ],
    });
    expect(fields.map((field) => field.id)).toEqual([
      "title",
      "calendarId",
      "allDay",
      "start",
      "end",
      "location",
      "dossier",
    ]);
    expect(fields[0]).toMatchObject({
      builtIn: "title",
      kind: "text",
      required: true,
      label: "$dms.agenda.form.title",
    });
    expect(fields[1]?.options).toEqual([
      { value: "design", label: "Design", icon: undefined },
    ]);
    expect(fields.at(-1)).toMatchObject({ kind: "text", required: true });
  });

  it("takes a list naming a built-in field as the whole form, in its order", () => {
    const fields = resolveFormFields({
      ...SOURCES,
      fields: [{ id: "start" }, { id: "title", label: "Client" }],
    });
    expect(fields.map((field) => field.id)).toEqual(["start", "title"]);
    expect(fields[1]?.label).toBe("Client");
  });

  it("shows a field only while its condition holds", () => {
    const field = { visibleWhen: { field: "type", in: ["leave"] } };
    expect(isFieldShown(field, { type: "leave" })).toBe(true);
    expect(isFieldShown(field, { type: "work" })).toBe(false);
    expect(isFieldShown({}, {})).toBe(true);
  });
});

describe("time in the agenda's zone", () => {
  it("reads and writes wall clocks across the DST change of 25 October 2026", () => {
    // 03:00 summer time is 02:00 winter time: the day lasts 25 hours.
    const before = wallClockEpoch("2026-10-25T01:30", BRUSSELS);
    const after = wallClockEpoch("2026-10-25T03:30", BRUSSELS);
    expect(before).not.toBeNull();
    expect((after! - before!) / 3_600_000).toBe(3);
    expect(wallClockIso("2026-10-25T09:30", BRUSSELS)).toBe(
      "2026-10-25T09:30:00+01:00",
    );
    expect(wallClockIso("2026-10-24T09:30", BRUSSELS)).toBe(
      "2026-10-24T09:30:00+02:00",
    );
    expect(wallClockOf(Date.parse("2026-10-25T08:30:00Z"), BRUSSELS)).toBe(
      "2026-10-25T09:30",
    );
  });

  it("draws in a zone that is not the browser's", () => {
    expect(wallClockOf(Date.parse("2026-10-25T08:30:00Z"), TOKYO)).toBe(
      "2026-10-25T17:30",
    );
    expect(wallClockIso("2026-10-25T17:30", TOKYO)).toBe(
      "2026-10-25T17:30:00+09:00",
    );
  });
});

describe("values and changes", () => {
  const fields = resolveFormFields({
    ...SOURCES,
    fields: [{ id: "dossier" }],
  });
  const meeting = occurrence({
    id: "e1",
    title: "Sprint planning",
    start: "2026-10-26T09:00:00+01:00",
    end: "2026-10-26T10:30:00+01:00",
    calendarId: "design",
    location: "Room A",
    data: { dossier: "45601", other: 1 },
  });

  it("opens on an occurrence with its wall clocks in the zone", () => {
    const values = valuesFromOccurrence(meeting, fields, BRUSSELS);
    expect(values).toMatchObject({
      title: "Sprint planning",
      calendarId: "design",
      allDay: false,
      start: "2026-10-26T09:00",
      end: "2026-10-26T10:30",
      location: "Room A",
      dossier: "45601",
    });
    const inTokyo = valuesFromOccurrence(meeting, fields, TOKYO);
    expect(inTokyo.start).toBe("2026-10-26T17:00");
  });

  it("saves only what changed, with what it was", () => {
    const values = valuesFromOccurrence(meeting, fields, BRUSSELS);
    const unchanged = buildPatch(fields, values, BRUSSELS);
    expect(updateChange(meeting, unchanged, BRUSSELS)).toBeNull();

    const next = buildPatch(
      fields,
      { ...values, title: "Planning", end: "2026-10-26T11:00", dossier: "9" },
      BRUSSELS,
    );
    expect(updateChange(meeting, next, BRUSSELS)).toEqual({
      kind: "update",
      id: "e1",
      patch: {
        title: "Planning",
        end: "2026-10-26T11:00:00+01:00",
        data: { dossier: "9", other: 1 },
      },
      previous: {
        title: "Sprint planning",
        end: "2026-10-26T10:30:00+01:00",
        data: { dossier: "45601", other: 1 },
      },
    });
  });

  it("names the series and the scope of a recurring occurrence", () => {
    const standup = occurrence(
      {
        id: "standup",
        title: "Design standup",
        start: "2026-10-27T09:00:00+01:00",
        end: "2026-10-27T09:15:00+01:00",
      },
      {
        key: "standup@2026-10-27",
        recurring: { seriesId: "standup", occurrence: "2026-10-27" },
      },
    );
    const values = valuesFromOccurrence(standup, fields, BRUSSELS);
    const next = buildPatch(fields, { ...values, title: "Standup" }, BRUSSELS);
    expect(updateChange(standup, next, BRUSSELS, "series")).toMatchObject({
      id: "standup",
      occurrence: "2026-10-27",
      scope: "series",
      patch: { title: "Standup" },
    });
    expect(deleteChange(standup, BRUSSELS)).toMatchObject({
      kind: "delete",
      id: "standup",
      scope: "occurrence",
    });
  });

  it("creates an event from a placement, an all-day one by its days", () => {
    const monday = wallClockEpoch("2026-10-26T00:00", BRUSSELS)!;
    const wednesday = wallClockEpoch("2026-10-28T00:00", BRUSSELS)!;
    const values = valuesFromPlacement(
      { start: monday, end: wednesday, allDay: true, resourceIds: ["r1"] },
      fields,
      BRUSSELS,
      { calendarId: "design" },
    );
    expect(values).toMatchObject({
      allDay: true,
      start: "2026-10-26T09:00",
      end: "2026-10-27T10:00",
      calendarId: "design",
      resourceIds: ["r1"],
    });
    const change = createChange(
      buildPatch(fields, { ...values, title: "Leave" }, BRUSSELS),
    );
    expect(change.kind).toBe("create");
    expect(change.tempId).toMatch(/^tmp-/);
    expect(change.patch).toMatchObject({
      title: "Leave",
      allDay: true,
      start: "2026-10-26",
      end: "2026-10-27",
    });
  });

  it("ends an all-day event the day before a timed end at midnight", () => {
    const patch = buildPatch(
      fields,
      {
        title: "Off",
        allDay: true,
        start: "2026-10-26T00:00",
        end: "2026-10-28T00:00",
      },
      BRUSSELS,
    );
    expect(patch).toMatchObject({ start: "2026-10-26", end: "2026-10-27" });
  });

  it("#6 sends a cleared field as null, and null as what Undo puts back", () => {
    const values = valuesFromOccurrence(meeting, fields, BRUSSELS);
    const cleared = buildPatch(
      fields,
      { ...values, location: "", dossier: "", description: "Agenda" },
      BRUSSELS,
    );
    const change = updateChange(meeting, cleared, BRUSSELS)!;
    expect(change.patch).toEqual({
      location: null,
      description: "Agenda",
      data: { dossier: null, other: 1 },
    });
    // On the wire the clears survive (an absent key would keep the value).
    expect(JSON.parse(JSON.stringify(change.patch))).toMatchObject({
      location: null,
      data: { dossier: null },
    });
    // The description was absent: Undo clears it again.
    expect(change.previous).toEqual({
      location: "Room A",
      description: null,
      data: { dossier: "45601", other: 1 },
    });
  });

  it("#6 sends nothing for a field left empty that was empty", () => {
    const values = valuesFromOccurrence(meeting, fields, BRUSSELS);
    const next = buildPatch(fields, { ...values, description: "" }, BRUSSELS);
    expect(updateChange(meeting, next, BRUSSELS)).toBeNull();
  });

  it("#6 creates without nulls: a new event has nothing to clear", () => {
    const start = wallClockEpoch("2026-10-26T13:00", BRUSSELS)!;
    const values = valuesFromPlacement(
      { start, end: start + 3_600_000, allDay: false, resourceIds: [] },
      fields,
      BRUSSELS,
    );
    const change = createChange(
      buildPatch(fields, { ...values, title: "New" }, BRUSSELS),
    );
    expect(Object.values(change.patch!)).not.toContain(null);
    expect(change.patch).not.toHaveProperty("location");
    expect(change.patch?.data ?? {}).toEqual({});
  });

  it("refuses an empty required field and an end before its start", () => {
    const errors = validateForm(
      fields,
      {
        title: " ",
        allDay: false,
        start: "2026-10-26T10:00",
        end: "2026-10-26T09:00",
      },
      BRUSSELS,
    );
    expect(errors).toEqual({
      title: "$dms.agenda.form.required",
      end: "$dms.agenda.form.end_before_start",
    });
    expect(
      validateForm(
        fields,
        {
          title: "Ok",
          allDay: false,
          start: "2026-10-26T09:00",
          end: "2026-10-26T10:00",
        },
        BRUSSELS,
      ),
    ).toEqual({});
  });

  it("gives the actions the occurrence's fields over its data", () => {
    const row = agendaActionRow(meeting, BRUSSELS);
    expect(row).toMatchObject({
      id: "e1",
      title: "Sprint planning",
      start: "2026-10-26T09:00:00+01:00",
      calendarId: "design",
      dossier: "45601",
      location: "Room A",
    });
  });
});
