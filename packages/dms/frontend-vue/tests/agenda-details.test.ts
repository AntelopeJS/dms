// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- one probe component per agenda */
/**
 * The details of a FullAgenda (`useAgendaDetails`) over a fake context: a
 * new event's form and its `create` change, a refused form, the scope of a
 * recurring edit (asked, or fixed by `recurringEdit`), deleting with a
 * confirmation (the scope prompt standing in for it on a series), leaving
 * the form, and the event actions an occurrence offers.
 */
import { createApp, defineComponent, h, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeAgendaContext,
  fakeOccurrence,
  type FakeAgenda,
} from "./fixtures/agendaFakeContext";
import type { AgendaDetailsApi } from "../layers/dms-ui/app/build/composables/agenda/useAgendaDetails";
import type { FullAgendaOptions } from "../layers/dms-ui/app/types/full-agenda";

const modalAnswer = { value: undefined as unknown };
const confirmAnswer = { value: true };
const modalOpen = vi.fn();
const confirmOpen = vi.fn();

vi.mock("../layers/dms-ui/app/composables/containers/useModal", () => ({
  useModal: () => ({ open: modalOpen }),
}));
vi.mock("../layers/dms-ui/app/composables/confirm/useConfirm", () => ({
  useConfirm: () => ({ confirm: confirmOpen }),
}));

const { useAgendaDetails } = await import(
  "../layers/dms-ui/app/build/composables/agenda/useAgendaDetails"
);

const BRUSSELS = "Europe/Brussels";
const MEETING = {
  id: "e1",
  title: "Sprint planning",
  start: "2026-10-26T09:00:00+01:00",
  end: "2026-10-26T10:00:00+01:00",
  calendarId: "design",
  data: { status: "open" },
};
const CALENDARS = [
  { id: "hidden", label: "Hidden" },
  { id: "design", label: "Design" },
];

const apps: Array<{ unmount: () => void }> = [];

/** Types into the form as its inputs do (each field touched), and gives what it then holds. */
function typeIn(
  api: AgendaDetailsApi,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  for (const [field, value] of Object.entries(changes)) api.touch(field, value);
  return api.initialValues();
}

function details(raw: Partial<FullAgendaOptions> = {}): {
  api: AgendaDetailsApi;
  agenda: FakeAgenda;
} {
  const agenda = fakeAgendaContext({
    saveUrl: "/save",
    calendars: CALENDARS,
    timeZone: BRUSSELS,
    staticData: { events: [MEETING] },
    ...raw,
  });
  let api: AgendaDetailsApi | undefined;
  const app = createApp(
    defineComponent({
      setup() {
        api = useAgendaDetails(agenda.ctx);
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  apps.push(app);
  return { api: api!, agenda };
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
  modalAnswer.value = undefined;
  confirmAnswer.value = true;
  modalOpen.mockReset().mockImplementation(() => ({
    result: Promise.resolve(modalAnswer.value),
  }));
  confirmOpen.mockReset().mockImplementation(async () => confirmAnswer.value);
});

afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  vi.unstubAllGlobals();
});

describe("a new event", () => {
  it("opens on its placement in the first shown calendar and creates it", async () => {
    const { api, agenda } = details();
    agenda.ctx.hiddenCalendars.value = new Set(["hidden"]);
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
    expect(api.isNew.value).toBe(true);
    const values = api.initialValues();
    expect(values).toMatchObject({
      calendarId: "design",
      start: "2026-10-26T13:00",
      end: "2026-10-26T14:00",
    });
    expect(await api.save(typeIn(api, { title: "Demo" }))).toBe(true);
    expect(agenda.applied[0]).toMatchObject({
      kind: "create",
      patch: {
        title: "Demo",
        calendarId: "design",
        start: "2026-10-26T13:00:00+01:00",
        end: "2026-10-26T14:00:00+01:00",
        allDay: false,
      },
    });
    expect(agenda.applied[0]?.tempId).toMatch(/^tmp-/);
    expect(agenda.ctx.details.value).toBeNull();
  });

  it("refuses a form without its required title", async () => {
    const { api, agenda } = details();
    agenda.ctx.details.value = {
      occurrence: null,
      placement: { start: 0, end: 3_600_000, allDay: false, resourceIds: [] },
      mode: "edit",
      container: "drawer",
    };
    expect(await api.save(typeIn(api, { title: "" }))).toBe(false);
    expect(api.errors.value.title).toBe("$dms.agenda.form.required");
    expect(agenda.applied).toHaveLength(0);
  });
});

describe("an occurrence", () => {
  const recurringOccurrence = () =>
    fakeOccurrence(
      { ...MEETING, id: "standup" },
      {
        key: "standup@2026-10-26",
        recurring: { seriesId: "standup", occurrence: "2026-10-26" },
      },
    );

  it("asks the scope of a recurring edit, and backs out without an answer", async () => {
    const { api, agenda } = details();
    agenda.ctx.details.value = {
      occurrence: recurringOccurrence(),
      mode: "edit",
      container: "drawer",
    };
    modalAnswer.value = "series";
    expect(await api.save(typeIn(api, { title: "Standup" }))).toBe(true);
    expect(agenda.applied[0]).toMatchObject({
      kind: "update",
      id: "standup",
      scope: "series",
      occurrence: "2026-10-26",
    });

    agenda.ctx.details.value = {
      occurrence: recurringOccurrence(),
      mode: "edit",
      container: "drawer",
    };
    modalAnswer.value = undefined;
    expect(await api.save(typeIn(api, { title: "Other" }))).toBe(false);
    expect(agenda.applied).toHaveLength(1);
  });

  it("takes the scope `recurringEdit` fixes without asking", async () => {
    const { api, agenda } = details({ recurringEdit: "occurrence" });
    agenda.ctx.details.value = {
      occurrence: recurringOccurrence(),
      mode: "edit",
      container: "drawer",
    };
    await api.save(typeIn(api, { title: "Standup" }));
    expect(modalOpen).not.toHaveBeenCalled();
    expect(agenda.applied[0]).toMatchObject({ scope: "occurrence" });
  });

  it("deletes after a confirmation, or the scope prompt on a series", async () => {
    const { api, agenda } = details();
    const meeting = agenda.ctx.occurrences.value[0]!;
    agenda.ctx.details.value = {
      occurrence: meeting,
      mode: "view",
      container: "drawer",
    };
    confirmAnswer.value = false;
    await api.remove();
    expect(agenda.applied).toHaveLength(0);
    confirmAnswer.value = true;
    await api.remove();
    expect(agenda.applied[0]).toMatchObject({ kind: "delete", id: "e1" });
    expect(agenda.ctx.details.value).toBeNull();

    agenda.ctx.details.value = {
      occurrence: recurringOccurrence(),
      mode: "view",
      container: "drawer",
    };
    modalAnswer.value = "series";
    confirmOpen.mockClear();
    await api.remove();
    expect(confirmOpen).not.toHaveBeenCalled();
    expect(agenda.applied[1]).toMatchObject({
      kind: "delete",
      id: "standup",
      scope: "series",
    });
  });

  it("goes from the read view to the form and back", () => {
    const { api, agenda } = details();
    const meeting = agenda.ctx.occurrences.value[0]!;
    agenda.ctx.details.value = {
      occurrence: meeting,
      mode: "view",
      container: "popover",
    };
    api.edit();
    expect(agenda.ctx.details.value?.mode).toBe("edit");
    api.cancel();
    expect(agenda.ctx.details.value?.mode).toBe("view");
  });

  it("is read-only when the agenda or its calendar is", () => {
    const readOnly = details({ saveUrl: undefined });
    readOnly.agenda.ctx.details.value = {
      occurrence: readOnly.agenda.ctx.occurrences.value[0]!,
      mode: "view",
      container: "drawer",
    };
    expect(readOnly.api.canEdit.value).toBe(false);
    readOnly.api.edit();
    expect(readOnly.agenda.ctx.details.value?.mode).toBe("view");

    const locked = details({
      calendars: [{ id: "design", label: "Design", editable: false }],
    });
    locked.agenda.ctx.details.value = {
      occurrence: locked.agenda.ctx.occurrences.value[0]!,
      mode: "view",
      container: "drawer",
    };
    expect(locked.api.canEdit.value).toBe(false);
    expect(locked.api.canDelete.value).toBe(false);
  });

  it("offers the actions whose condition holds on the event's row", () => {
    const target = { type: "api", url: "/x" } as never;
    const { api, agenda } = details({
      eventActions: [
        {
          id: "close",
          label: "Close",
          target,
          visibleWhen: { field: "status", in: ["open"] },
        },
        {
          id: "reopen",
          label: "Reopen",
          target,
          visibleWhen: { field: "status", in: ["closed"] },
        },
        { id: "copy", label: "Duplicate", target },
      ],
    });
    const meeting = agenda.ctx.occurrences.value[0]!;
    expect(api.actionsOf(meeting).map((action) => action.id)).toEqual([
      "close",
      "copy",
    ]);
    api.runAction(api.actionsOf(meeting)[0]!, meeting);
    expect(agenda.ctx.runEventAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "close" }),
      meeting,
    );
  });
});

/** Another details instance over the same agenda (the form mounted anew). */
function detailsOn(agenda: FakeAgenda): AgendaDetailsApi {
  let api: AgendaDetailsApi | undefined;
  const app = createApp(
    defineComponent({
      setup() {
        api = useAgendaDetails(agenda.ctx);
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  apps.push(app);
  return api!;
}

describe("round 1", () => {
  it("#21 keeps the form open, flagged, when the route refuses", async () => {
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

  it("#10 gives a form mounted again the values typed, until it is left", () => {
    const { api, agenda } = details();
    const meeting = agenda.ctx.occurrences.value[0]!;
    agenda.ctx.details.value = {
      occurrence: meeting,
      mode: "edit",
      container: "popover",
    };
    api.touch("title", "Typed");
    // The popover became a drawer: a new form on the same event.
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

describe("round 2", () => {
  it("N5 forgets a draft once the details leave its event or its form", async () => {
    const { syncAgendaDraft } = await import(
      "../layers/dms-ui/app/build/composables/agenda/useAgendaDetails"
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
    // Another event opens: the draft goes.
    const other = {
      occurrence: second!,
      mode: "view" as const,
      container: "popover" as const,
    };
    agenda.ctx.details.value = other;
    syncAgendaDraft(agenda.ctx, other);
    agenda.ctx.details.value = editFirst;
    expect(detailsOn(agenda).initialValues().title).toBe("Sprint planning");
    // The same event in its read view: gone too.
    detailsOn(agenda).touch("title", "Again");
    const read = { ...editFirst, mode: "view" as const };
    syncAgendaDraft(agenda.ctx, read);
    agenda.ctx.details.value = editFirst;
    expect(detailsOn(agenda).initialValues().title).toBe("Sprint planning");
    // The same form in a drawer: kept.
    detailsOn(agenda).touch("title", "Kept");
    syncAgendaDraft(agenda.ctx, { ...editFirst, container: "drawer" });
    expect(detailsOn(agenda).initialValues().title).toBe("Kept");
  });

  it("N5 keeps a move made while the form was open: only the touched fields are sent", async () => {
    const { api, agenda } = details();
    const meeting = agenda.ctx.occurrences.value[0]!;
    agenda.ctx.details.value = {
      occurrence: meeting,
      mode: "edit",
      container: "popover",
    };
    const typed = typeIn(api, { title: "Renamed" });
    // A drag moved the event an hour later meanwhile; the form still holds 09:00.
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

  it("N28 shows the route's own message, and keeps it with the form", async () => {
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
    // The popover became a drawer: the new form shows it too.
    expect(detailsOn(agenda).errors.value._form).toBe("Locked by payroll");
  });
});

describe("round 3", () => {
  it("m11 saves a new event in the calendar its form showed, whatever the legend does", async () => {
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
    // The form opens on the first shown calendar.
    expect(api.initialValues().calendarId).toBe("design");
    // Design is hidden in the legend while the form is open.
    agenda.ctx.hiddenCalendars.value = new Set(["design"]);
    expect(await api.save(typeIn(api, { title: "Demo" }))).toBe(true);
    expect(agenda.applied[0]).toMatchObject({
      kind: "create",
      patch: { calendarId: "design" },
    });
  });

  it("m11 opens a new event in the calendar the engine took for it", () => {
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
