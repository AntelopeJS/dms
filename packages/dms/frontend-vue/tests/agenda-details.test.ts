/** @vitest-environment jsdom */

/**
 * The details of a FullAgenda (`useAgendaDetails`) over a fake context: a
 * new event's form and its `create` change, a refused form, the scope of a
 * recurring edit (asked, or fixed by `recurringEdit`), deleting with a
 * confirmation (the scope prompt standing in for it on a series), leaving
 * the form, and the event actions an occurrence offers.
 */
import {
  details,
  detailsOverlay,
  recurringOccurrence,
  typeIn,
  useDetailsHarness,
} from "./fixtures/agendaDetailsHarness";
import { describe, expect, it } from "vitest";
import type { ActionTarget } from "../layers/dms-ui/app/composables/table-view/types/action-target";

useDetailsHarness();

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

  it("moves the agenda to the day of a new event saved for a day it does not show, and stays when it shows it (fails when a booking made from 11 Nov for 12 Nov stays out of sight)", async () => {
    const createOn = async (day: string) => {
      const { api, agenda } = details();
      const start = Date.parse(`${day}T13:00:00+01:00`);
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
      expect(await api.save(typeIn(api, { title: "Demo" }))).toBe(true);
      return agenda.ctx.goTo;
    };
    expect(await createOn("2026-11-04")).toHaveBeenCalledWith("2026-11-04");
    expect(await createOn("2026-10-27")).not.toHaveBeenCalled();
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

describe("an occurrence's recurring scope and deletion", () => {
  it("asks the scope of a recurring edit, and backs out without an answer", async () => {
    const { api, agenda } = details();
    agenda.ctx.details.value = {
      occurrence: recurringOccurrence(),
      mode: "edit",
      container: "drawer",
    };
    detailsOverlay.modalAnswer = "series";
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
    detailsOverlay.modalAnswer = undefined;
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
    expect(detailsOverlay.modalOpen).not.toHaveBeenCalled();
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
    detailsOverlay.confirmAnswer = false;
    await api.remove();
    expect(agenda.applied).toHaveLength(0);
    detailsOverlay.confirmAnswer = true;
    await api.remove();
    expect(agenda.applied[0]).toMatchObject({ kind: "delete", id: "e1" });
    expect(agenda.ctx.details.value).toBeNull();

    agenda.ctx.details.value = {
      occurrence: recurringOccurrence(),
      mode: "view",
      container: "drawer",
    };
    detailsOverlay.modalAnswer = "series";
    detailsOverlay.confirmOpen.mockClear();
    await api.remove();
    expect(detailsOverlay.confirmOpen).not.toHaveBeenCalled();
    expect(agenda.applied[1]).toMatchObject({
      kind: "delete",
      id: "standup",
      scope: "series",
    });
  });
});

describe("an occurrence's read view, form and actions", () => {
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
    const target: ActionTarget = {
      type: "api",
      url: "/x",
      successMessage: "Done",
    };
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
