/**
 * What a FullAgenda route says beyond its events: that its data changed under a refused change, so the
 * block reads it again, and the title of a new event's details in the agenda's own words.
 */
import { isString } from "../layers/dms-core/app/utils/type-check";
import type { BlockText } from "../layers/dms-core/app/types/composed-text";
import { describe, expect, it } from "vitest";
import { needsRefresh } from "../layers/dms-ui/app/entries/composables/agenda/agendaData";
import { newEventTitle } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaDetails";
import { move } from "./helpers/agenda-save-harness";

describe("what an agenda route tells the block besides its events", () => {
  it("reads the range again when the route says its data changed, even with every change answered (fails when a refused series edit leaves the stale series on screen)", () => {
    expect([
      needsRefresh({ refresh: true }, [move("a", "x")]),
      needsRefresh({}, [move("a", "x")]),
    ]).toEqual([true, false]);
  });

  it("titles a new event's details with the agenda's own words, else the block's (fails when working hours open as a new booking)", () => {
    const text = (value: BlockText) =>
      `text:${isString(value) ? value : value.key}`;
    expect([
      newEventTitle({ newTitle: "$hours.new" }, text, "New booking"),
      newEventTitle(undefined, text, "New booking"),
      newEventTitle({}, text, "New booking"),
    ]).toEqual(["text:$hours.new", "New booking", "New booking"]);
  });
});
