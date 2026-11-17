/**
 * The options a data answer gives a select of the details form, and the length an option presets: the kinds of a
 * booking come with each read, in the reader's language, and picking one on a new booking ends it after the type's usual duration.
 */
import { describe, expect, it } from "vitest";
import {
  resolveFormFields,
  valuesAfterPick,
  type AgendaFormField,
  type AgendaFormSources,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaForm";

const BRUSSELS = "Europe/Brussels";

const SOURCES: AgendaFormSources = {
  calendars: [],
  resources: [],
  text: String,
  fields: [
    { id: "typeLabelId", kind: "select" },
    { id: "start" },
    { id: "end" },
  ],
};

const TYPE_OPTIONS = [
  { value: "meeting", label: "Réunion", durationMinutes: 20 },
  { value: "workshop", label: "Atelier", durationMinutes: 45 },
  { value: "training", label: "Formation", durationMinutes: 120 },
  { value: "other", label: "Autre" },
];

function typeField(): AgendaFormField {
  const [field] = resolveFormFields({
    ...SOURCES,
    fieldOptions: { typeLabelId: TYPE_OPTIONS },
  });
  if (!field) throw new Error("the form has no type field");
  return field;
}

const OPEN = { start: "2026-11-10T09:00", end: "2026-11-10T09:30" };

describe("the options a data answer gives a select", () => {
  it("lists the answer's options for the field it names (fails when a select only reads the block's own options and stays empty)", () => {
    expect(typeField().options.map((option) => option.value)).toEqual([
      "meeting",
      "workshop",
      "training",
      "other",
    ]);
  });

  it("keeps the block's own options for a field the answer does not name (fails when the answer's options replace every select's)", () => {
    const field = resolveFormFields({
      ...SOURCES,
      fields: [
        {
          id: "room",
          kind: "select",
          options: [{ value: "a", label: "A" }],
        },
      ],
      fieldOptions: { typeLabelId: TYPE_OPTIONS },
    }).find((resolved) => resolved.id === "room");
    expect(field?.options.map((option) => option.value)).toEqual(["a"]);
  });
});

describe("the length an option presets", () => {
  it("ends a new booking after the duration of the type picked (fails when picking a type leaves the default 30 minutes)", () => {
    const values = valuesAfterPick(typeField(), "workshop", OPEN, {
      isNew: true,
      timeZone: BRUSSELS,
    });
    expect(values).toMatchObject({
      typeLabelId: "workshop",
      start: "2026-11-10T09:00",
      end: "2026-11-10T09:45",
    });
  });

  it("counts the duration in the agenda's zone across a clock change (fails when the end is computed as wall-clock text and is an hour off)", () => {
    const values = valuesAfterPick(
      typeField(),
      "training",
      { start: "2026-10-25T01:30", end: "2026-10-25T02:00" },
      { isNew: true, timeZone: BRUSSELS },
    );
    expect(values.end).toBe("2026-10-25T02:30");
  });

  it("keeps the end of a booking already booked (fails when changing its type stretches a booked slot)", () => {
    const values = valuesAfterPick(typeField(), "workshop", OPEN, {
      isNew: false,
      timeZone: BRUSSELS,
    });
    expect(values).toMatchObject({ typeLabelId: "workshop", end: OPEN.end });
  });

  it("keeps the end for an option with no duration, and for an all-day event (fails when an option without a length empties or moves the end)", () => {
    const field = typeField();
    expect(
      valuesAfterPick(field, "other", OPEN, {
        isNew: true,
        timeZone: BRUSSELS,
      }).end,
    ).toBe(OPEN.end);
    expect(
      valuesAfterPick(
        field,
        "meeting",
        { ...OPEN, allDay: true },
        { isNew: true, timeZone: BRUSSELS },
      ).end,
    ).toBe(OPEN.end);
  });

  it("leaves the end alone when the start does not read (fails when an invalid start yields an end of NaN)", () => {
    const values = valuesAfterPick(
      typeField(),
      "meeting",
      { start: "", end: OPEN.end },
      { isNew: true, timeZone: BRUSSELS },
    );
    expect(values.end).toBe(OPEN.end);
  });
});
