/** @vitest-environment jsdom */
/**
 * The form of a FullAgenda's details (`useAgendaDetails`) over a fake
 * context: a form refused or mounted again keeps what was typed, its draft
 * follows the event it is about, a new event keeps the calendar its form
 * showed, a type picked presets a new event's length, and an edit saves the
 * times its form shows.
 */
import { describe, expect, it, vi } from "vitest";
import { fakeOccurrence } from "./fixtures/agendaFakeContext";
import {
  MEETING,
  details,
  detailsOn,
  typeIn,
  useDetailsHarness,
} from "./fixtures/agendaDetailsHarness";

useDetailsHarness();

describe("a form refused or mounted again", () => {
  it("keeps the form open, flagged, when the route refuses", async () => {
    const { api, agenda } = details();
    const meeting = agenda.ctx.occurrences.value[0]!;
    agenda.ctx.details.value = {
      occurrence: meeting,
      mode: "edit",
      container: "drawer",
    };
    agenda.applyResult.value = false;
    const saved = await api.save(typeIn(api, { title: "Refused" }));
    expect(saved).toBe(false);
    expect(api.errors.value._form).toBe("$dms.agenda.details.status_error");
    expect(agenda.ctx.details.value?.mode).toBe("edit");
  });

  it("gives a form mounted again the values typed, until it is left", () => {
    const { api, agenda } = details();
    const meeting = agenda.ctx.occurrences.value[0]!;
    agenda.ctx.details.value = {
      occurrence: meeting,
      mode: "edit",
      container: "popover",
    };
    api.touch("title", "Typed");
    expect(detailsOn(agenda).initialValues().title).toBe("Typed");
    api.cancel();
    agenda.ctx.details.value = {
      occurrence: meeting,
      mode: "edit",
      container: "popover",
    };
    expect(detailsOn(agenda).initialValues().title).toBe("Sprint planning");
  });
});

describe("the draft of a form", () => {
  it("forgets a draft once the details leave its event or its form", async () => {
    const { syncAgendaDraft } = await import(
      "../layers/dms-ui/app/entries/composables/agenda/useAgendaDetails"
    );
    const { api, agenda } = details({
      staticData: {
        events: [MEETING, { ...MEETING, id: "e2", title: "Other" }],
      },
    });
    const [first, second] = agenda.ctx.occurrences.value;
    const editFirst = {
      occurrence: first!,
      mode: "edit" as const,
      container: "popover" as const,
    };
    agenda.ctx.details.value = editFirst;
    api.touch("title", "Abandoned");
    const other = {
      occurrence: second!,
      mode: "view" as const,
      container: "popover" as const,
    };
    agenda.ctx.details.value = other;
    syncAgendaDraft(agenda.ctx, other);
    agenda.ctx.details.value = editFirst;
    expect(detailsOn(agenda).initialValues().title).toBe("Sprint planning");
    detailsOn(agenda).touch("title", "Again");
    const read = { ...editFirst, mode: "view" as const };
    syncAgendaDraft(agenda.ctx, read);
    agenda.ctx.details.value = editFirst;
    expect(detailsOn(agenda).initialValues().title).toBe("Sprint planning");
    detailsOn(agenda).touch("title", "Kept");
    syncAgendaDraft(agenda.ctx, { ...editFirst, container: "drawer" });
    expect(detailsOn(agenda).initialValues().title).toBe("Kept");
  });

  it("keeps a move made while the form was open: only the touched fields are sent", async () => {
    const { api, agenda } = details();
    const meeting = agenda.ctx.occurrences.value[0]!;
    agenda.ctx.details.value = {
      occurrence: meeting,
      mode: "edit",
      container: "popover",
    };
    const typed = typeIn(api, { title: "Renamed" });
    const moved = fakeOccurrence({
      ...MEETING,
      start: "2026-10-26T10:00:00+01:00",
      end: "2026-10-26T11:00:00+01:00",
    });
    agenda.ctx.details.value = {
      occurrence: moved,
      mode: "edit",
      container: "popover",
    };
    expect(await api.save(typed)).toBe(true);
    expect(agenda.applied[0]).toMatchObject({
      kind: "update",
      patch: { title: "Renamed" },
    });
    expect(agenda.applied[0]?.patch).not.toHaveProperty("start");
    expect(agenda.applied[0]?.patch).not.toHaveProperty("end");
  });

  it("shows the route's own message, and keeps it with the form", async () => {
    const { api, agenda } = details();
    const meeting = agenda.ctx.occurrences.value[0]!;
    agenda.ctx.details.value = {
      occurrence: meeting,
      mode: "edit",
      container: "popover",
    };
    agenda.ctx.apply = vi.fn(async () => {
      agenda.ctx.lastRefusal!.value = {
        id: "e1",
        message: "Locked by payroll",
      };
      return false;
    });
    expect(await api.save(typeIn(api, { title: "Refused" }))).toBe(false);
    expect(api.errors.value._form).toBe("Locked by payroll");
    expect(detailsOn(agenda).errors.value._form).toBe("Locked by payroll");
  });
});

describe("the calendar of a new event", () => {
  it("saves a new event in the calendar its form showed, whatever the legend does", async () => {
    const { api, agenda } = details({
      calendars: [
        { id: "design", label: "Design" },
        { id: "eng", label: "Engineering" },
      ],
    });
    const start = Date.parse("2026-10-26T13:00:00+01:00");
    agenda.ctx.details.value = {
      occurrence: null,
      placement: {
        start,
        end: start + 3_600_000,
        allDay: false,
        resourceIds: [],
      },
      mode: "edit",
      container: "drawer",
    };
    expect(api.initialValues().calendarId).toBe("design");
    agenda.ctx.hiddenCalendars.value = new Set(["design"]);
    expect(await api.save(typeIn(api, { title: "Demo" }))).toBe(true);
    expect(agenda.applied[0]).toMatchObject({
      kind: "create",
      patch: { calendarId: "design" },
    });
  });

  it("opens a new event in the calendar the engine took for it", () => {
    const { api, agenda } = details({
      calendars: [
        { id: "design", label: "Design" },
        { id: "eng", label: "Engineering" },
      ],
    });
    agenda.ctx.details.value = {
      occurrence: null,
      placement: { start: 0, end: 3_600_000, allDay: false, resourceIds: [] },
      calendarId: "eng",
      mode: "edit",
      container: "drawer",
    };
    expect(api.initialValues().calendarId).toBe("eng");
  });
});

describe("a type picked in a new event's form", () => {
  const TYPES = [{ value: "workshop", label: "Atelier", durationMinutes: 45 }];

  function newBooking() {
    const { api, agenda } = details({
      fields: [
        { id: "title", required: false },
        { id: "typeLabelId", kind: "select" },
        { id: "start" },
        { id: "end" },
      ],
      staticData: { events: [], fieldOptions: { typeLabelId: TYPES } },
    });
    const start = Date.parse("2026-10-26T13:00:00+01:00");
    agenda.ctx.details.value = {
      occurrence: null,
      placement: {
        start,
        end: start + 1_800_000,
        allDay: false,
        resourceIds: [],
      },
      mode: "edit",
      container: "drawer",
    };
    return { api, agenda };
  }

  it("offers the types the data answer gives (fails when the select reads only the block's options)", () => {
    const { api } = newBooking();
    expect(
      api.fields.value.find((field) => field.id === "typeLabelId")?.options,
    ).toEqual(TYPES);
  });

  it("saves the end the type set with the type (fails when the end the pick moved is not kept as touched, and the default 30 minutes are booked)", async () => {
    const { api, agenda } = newBooking();
    const values = api.pick("typeLabelId", "workshop", api.initialValues());
    expect(values.end).toBe("2026-10-26T13:45");
    expect(await api.save(values)).toBe(true);
    expect(agenda.applied[0]).toMatchObject({
      kind: "create",
      patch: {
        end: "2026-10-26T13:45:00+01:00",
        data: { typeLabelId: "workshop" },
      },
    });
  });
});

describe("the times an edit saves are the times its form shows", () => {
  function editMeeting() {
    const { api, agenda } = details();
    agenda.ctx.details.value = {
      occurrence: fakeOccurrence(MEETING),
      mode: "edit",
      container: "drawer",
    };
    return { api, agenda };
  }

  it("moves the end with a new start, keeping the length, and saves both (fails when the form shows the old end while the route keeps the old length)", async () => {
    const { api, agenda } = editMeeting();

    const values = api.pick("start", "2026-10-26T09:15", api.initialValues());

    expect(values.end).toBe("2026-10-26T10:15");
    expect(await api.save(values)).toBe(true);
    expect(agenda.applied[0]?.patch).toMatchObject({
      start: "2026-10-26T09:15:00+01:00",
      end: "2026-10-26T10:15:00+01:00",
    });
  });

  it("sends the end it shows with a changed start, never the start alone (fails when the route is left to infer the end from the stored length)", async () => {
    const { api, agenda } = editMeeting();

    expect(await api.save(typeIn(api, { start: "2026-10-26T09:30" }))).toBe(
      true,
    );

    expect(agenda.applied[0]?.patch).toMatchObject({
      start: "2026-10-26T09:30:00+01:00",
      end: "2026-10-26T10:00:00+01:00",
    });
  });

  it("keeps the end the member set when only the end changes (fails when a new end also moves the start)", () => {
    const { api } = editMeeting();

    const values = api.pick("end", "2026-10-26T11:00", api.initialValues());

    expect([values.start, values.end]).toEqual([
      "2026-10-26T09:00",
      "2026-10-26T11:00",
    ]);
  });
});
