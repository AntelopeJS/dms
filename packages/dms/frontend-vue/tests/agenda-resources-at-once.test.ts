import { describe, expect, it } from "vitest";
import {
  hiddenOutsidePick,
  pickedAmong,
  togglePickedResource,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaFilters";
import { resolveAgendaViews } from "../layers/dms-ui/app/entries/composables/agenda/agendaRange";
import type {
  AgendaResource,
  AgendaView,
} from "../layers/dms-ui/app/types/full-agenda";

const rooms: AgendaResource[] = ["a", "b", "c"].map((id) => ({
  id,
  label: id,
}));

describe("resourcesAtOnce", () => {
  it("shows the first rooms by default (fails when the default pick is every room or the last ones)", () => {
    expect(pickedAmong(rooms, [], 1)).toEqual(["a"]);
    expect(pickedAmong(rooms, [], 2)).toEqual(["a", "b"]);
  });

  it("drops a picked room a facet no longer keeps (fails when a stale id leaves no column)", () => {
    expect(pickedAmong(rooms.slice(1), ["a"], 1)).toEqual(["b"]);
  });

  it("acts as a radio with 1 (fails when a click adds the room or hides the last one)", () => {
    expect(togglePickedResource([], rooms, 1, "b")).toEqual(["b"]);
    expect(togglePickedResource(["b"], rooms, 1, "c")).toEqual(["c"]);
    expect(togglePickedResource(["c"], rooms, 1, "c")).toEqual(["c"]);
  });

  it("keeps at most N rooms and drops the oldest picked (fails when it drops the newest or exceeds N)", () => {
    expect(togglePickedResource(["a", "b"], rooms, 2, "c")).toEqual(["b", "c"]);
    expect(togglePickedResource(["a"], rooms, 2, "b")).toEqual(["a", "b"]);
  });

  it("unpicks a picked room when several are picked (fails when a click on a picked room never unpicks)", () => {
    expect(togglePickedResource(["a", "b"], rooms, 2, "a")).toEqual(["b"]);
  });

  it("ignores a click on an unlisted resource (fails when it picks a room that has no column)", () => {
    expect(togglePickedResource(["a"], rooms, 1, "zz")).toEqual(["a"]);
  });

  it("hides every room outside the pick (fails when the picked room is the hidden one)", () => {
    expect([...hiddenOutsidePick(rooms, ["b"])]).toEqual(["a", "c"]);
  });

  it("resolves onto a resources or timeline view only, at least 1 (fails when a week view or 0 keeps the option)", () => {
    const resolve = (view: AgendaView) =>
      resolveAgendaViews([view], {}, () => "x")[0]!.resourcesAtOnce;
    expect(resolve({ type: "resources", resourcesAtOnce: 1 })).toBe(1);
    expect(resolve({ type: "timeline", resourcesAtOnce: 2.7 })).toBe(2);
    expect(resolve({ type: "resources", resourcesAtOnce: 0 })).toBe(1);
    expect(resolve({ type: "week", resourcesAtOnce: 1 })).toBeUndefined();
    expect(resolve({ type: "resources" })).toBeUndefined();
  });
});
