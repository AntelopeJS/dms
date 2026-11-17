import { describe, expect, it } from "vitest";
import { followRefresh } from "../layers/dms-ui/app/entries/composables/agenda/agendaDetailsSync";
import { fakeOccurrence } from "./fixtures/agendaFakeContext";

const EVENT = {
  id: "e1",
  title: "Check",
  start: "2026-11-09T09:00:00+01:00",
  end: "2026-11-09T09:30:00+01:00",
  data: { status: "booked" },
};
const open = (mode: "view" | "edit") => ({
  occurrence: fakeOccurrence(EVENT),
  mode,
  container: "drawer" as const,
});

describe("the drawer after the events were read again", () => {
  it("shows the fresh occurrence of the open event in the read view (fails when the drawer keeps offering the old status actions)", () => {
    const fresh = fakeOccurrence({ ...EVENT, data: { status: "arrived" } });

    const next = followRefresh(open("view"), [fresh]);

    expect(next?.occurrence).toBe(fresh);
    expect(next?.mode).toBe("view");
  });

  it("leaves a form alone, so what the user typed is not replaced (fails when a refresh swaps the event under an open form)", () => {
    const details = open("edit");

    const next = followRefresh(details, [
      fakeOccurrence({ ...EVENT, data: { status: "arrived" } }),
    ]);

    expect(next).toBe(details);
  });

  it("keeps the same state when nothing changed or the event is gone (fails when a refresh re-renders the drawer for nothing or crashes)", () => {
    const details = open("view");

    expect(followRefresh(details, [details.occurrence])).toBe(details);
    expect(followRefresh(details, [])).toBe(details);
    expect(followRefresh(null, [details.occurrence])).toBeNull();
  });

  it("closes the read view once its event left the agenda read, as a booking sent to the waiting list does, and keeps one only hidden by a filter (fails when the drawer keeps offering 'Mark as arrived' on a waiting request)", () => {
    const details = open("view");

    expect(followRefresh(details, [], new Set(["e2"]))).toBeNull();
    expect(followRefresh(details, [], new Set(["e1"]))).toBe(details);
    expect(followRefresh(open("edit"), [], new Set())).not.toBeNull();
  });
});
