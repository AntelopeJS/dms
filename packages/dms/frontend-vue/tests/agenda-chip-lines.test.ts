import { describe, expect, it } from "vitest";
import { isString } from "../layers/dms-core/app/utils/type-check";
import type { BlockText } from "../layers/dms-core/app/types/composed-text";
import {
  blockLinesThatFit,
  chipLabelExtras,
  type BlockLine,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaChip";
import type { AgendaOccurrence } from "../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import type { AgendaEvent } from "../layers/dms-ui/app/types/full-agenda";

const ALL: BlockLine[] = [
  "time",
  "subtitle",
  "location",
  "resource",
  "description",
  "badges",
];

function occurrence(event: AgendaEvent): AgendaOccurrence {
  return {
    key: event.id,
    event,
    allDay: false,
    start: 0,
    end: 0,
    startDay: "2027-04-12",
    endDay: "2027-04-12",
    startMinutes: 0,
    endMinutes: 0,
    resourceIds: [],
    paint: { background: "", bar: "", text: "", onBar: "" },
    canMove: false,
    canResize: false,
    canDelete: false,
    details: "drawer",
  };
}

describe("the lines a short block keeps (96 px per hour)", () => {
  it("a 15-minute block (24 px) keeps only its title line (fails when a time line is cut in half under it)", () => {
    expect(blockLinesThatFit(24, "normal", ALL)).toEqual([]);
  });

  it("a 30-minute block (48 px) keeps the time and drops the subtitle that would be cut (fails when the subtitle shows clipped)", () => {
    expect(blockLinesThatFit(48, "normal", ["time", "subtitle"])).toEqual([
      "time",
    ]);
  });

  it("a line that does not fit stops the list, so a lower line never shows above a missing one (fails when a later small line skips over it)", () => {
    expect(blockLinesThatFit(45, "normal", ["badges", "time"])).toEqual([]);
  });

  it("the compact density packs one more line in the same height (fails when compact uses the normal paddings)", () => {
    const wanted: BlockLine[] = ["time", "subtitle"];
    expect(blockLinesThatFit(46, "normal", wanted)).toEqual(["time"]);
    expect(blockLinesThatFit(46, "compact", wanted)).toEqual([
      "time",
      "subtitle",
    ]);
  });

  it("a tall block keeps every line in order (fails when a line is lost or reordered)", () => {
    expect(blockLinesThatFit(400, "normal", ALL)).toEqual(ALL);
  });
});

describe("the status mark in a chip's accessible name", () => {
  const t = (key: string) => `t:${key}`;
  const text = (value: BlockText) =>
    `text:${isString(value) ? value : value.key}`;
  const event: AgendaEvent = {
    id: "a",
    title: "Dupont",
    start: "2027-04-12T09:00:00+02:00",
    status: "tentative",
    mark: { label: "Waiting room", icon: "i-ph-armroom", tone: "warning" },
  };

  it("names the mark before the status (fails when the mark is left out of the name or put after the status)", () => {
    expect(chipLabelExtras(occurrence(event), t, text)).toEqual([
      "text:Waiting room",
      "t:dms.agenda.grid.tentative",
    ]);
  });
});
