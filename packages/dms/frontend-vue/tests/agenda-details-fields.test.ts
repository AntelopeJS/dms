import { describe, expect, it } from "vitest";
import { fieldsWithValues } from "../layers/dms-ui/app/entries/composables/agenda/agendaForm";

describe("the fields the booking drawer shows", () => {
  it("leaves out a field with no value, such as an empty wished period on a booked booking, and keeps false and zero (fails when empty rows are drawn, or a false answer is hidden)", () => {
    const fields = [
      "guestId",
      "note",
      "wishedFrom",
      "tags",
      "urgent",
      "count",
    ].map((id) => ({ id }));

    expect(
      fieldsWithValues(fields, {
        guestId: "p1",
        note: "  ",
        wishedFrom: null,
        tags: [],
        urgent: false,
        count: 0,
      }).map((field) => field.id),
    ).toEqual(["guestId", "urgent", "count"]);
  });
});
