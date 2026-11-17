import { describe, expect, it } from "vitest";
import {
  ALERT_MARK_ICON,
  alertMarkOf,
  chipLabelExtras,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaChip";
import type { AgendaOccurrence } from "../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import type { AgendaEvent } from "../layers/dms-ui/app/types/full-agenda";
import { isString } from "../layers/dms-core/app/utils/type-check";
import type { BlockText } from "../layers/dms-core/app/types/composed-text";

function occurrence(event: AgendaEvent): AgendaOccurrence {
  return {
    key: event.id,
    event,
    allDay: false,
    start: Date.parse(event.start),
    end: Date.parse(event.end ?? event.start),
    startDay: event.start.slice(0, 10),
    endDay: (event.end ?? event.start).slice(0, 10),
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

const t = (key: string) => `t:${key}`;
const text = (value: BlockText) =>
  `text:${isString(value) ? value : value.key}`;
const struck = (extra: Partial<AgendaEvent>): AgendaEvent => ({
  id: "a",
  title: "Dupont",
  start: "2027-04-12T09:00:00+02:00",
  end: "2027-04-12T09:30:00+02:00",
  status: "cancelled",
  ...extra,
});

describe("the accessible name of an agenda chip", () => {
  it("announces a struck-through no-show by its own status label, not as cancelled (fails when the generic word wins over statusLabel)", () => {
    expect(
      chipLabelExtras(
        occurrence(struck({ statusLabel: "$app.status.no_show" })),
        t,
        text,
      ),
    ).toEqual(["text:$app.status.no_show"]);
  });

  it("keeps the generic word for a cancelled event without its own label (fails when a cancellation loses its status)", () => {
    expect(chipLabelExtras(occurrence(struck({})), t, text)).toEqual([
      "t:dms.agenda.grid.cancelled",
    ]);
  });
});

describe("the alert mark of an agenda chip", () => {
  it("marks the alerts in the tone of the strongest, named by every alert in order, and leaves other badges out (fails when the first alert's tone wins over a later danger, or a status badge raises the mark)", () => {
    expect(
      alertMarkOf([
        { label: "In the room", tone: "success" },
        { label: "Smoker", tone: "info", alert: true },
        { label: "Anticoagulants", tone: "error", alert: true },
        { label: "Diabetes", tone: "warning", alert: true },
      ]),
    ).toEqual({
      tone: "error",
      icon: ALERT_MARK_ICON,
      labels: ["Smoker", "Anticoagulants", "Diabetes"],
    });
  });

  it("draws no mark for an event without an alert badge (fails when an overbooked or arrived badge alone shows an alert)", () => {
    expect(alertMarkOf([{ label: "Overbooked", tone: "warning" }])).toBeNull();
    expect(alertMarkOf(undefined)).toBeNull();
  });
});
