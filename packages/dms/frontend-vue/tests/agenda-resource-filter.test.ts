import { describe, expect, it } from "vitest";
import { occurrenceStub } from "./fixtures/agendaFakeContext";
import {
  filterByResources,
  hiddenAmong,
  toggleHiddenResource,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaFilters";
import { foldOnResize } from "../layers/dms-ui/app/entries/composables/agenda/agendaShell";
import type { AgendaOccurrence } from "../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import type { AgendaResource } from "../layers/dms-ui/app/types/full-agenda";

const rooms: AgendaResource[] = ["a", "b", "c"].map((id) => ({
  id,
  label: id,
}));

function on(...resourceIds: string[]): AgendaOccurrence {
  return occurrenceStub({ key: resourceIds.join(), resourceIds });
}

describe("the room filter", () => {
  it("hides a room on a click and shows it on the next (fails when a toggle only ever hides)", () => {
    const hidden = toggleHiddenResource(new Set(), rooms, "b");
    expect([...hidden]).toEqual(["b"]);
    expect([...toggleHiddenResource(hidden, rooms, "b")]).toEqual([]);
  });

  it("never hides the last room shown (fails when a click can empty the agenda)", () => {
    const hidden = toggleHiddenResource(new Set(["a", "b"]), rooms, "c");
    expect([...hidden].sort()).toEqual(["a", "b"]);
  });

  it("forgets hidden ids that are no resource, and hides none when they would hide all (fails when a stale id or a full set empties the columns)", () => {
    expect([...hiddenAmong(rooms, new Set(["gone", "a"]))]).toEqual(["a"]);
    expect(hiddenAmong(rooms, new Set(["a", "b", "c"])).size).toBe(0);
  });

  it("drops the events of hidden rooms only, keeps one shared with a shown room and one with no room (fails when any hidden id removes the event)", () => {
    const kept = filterByResources(
      [on("a"), on("a", "b"), on(), on("b")],
      new Set(["a"]),
    );
    expect(kept.map((item) => item.key)).toEqual(["a,b", "", "b"]);
  });
});

describe("the sidebar fold below a width", () => {
  const wide = { open: true, narrow: false, openBeforeNarrow: true };

  it("folds when the container narrows and unfolds when it widens (fails when it stays folded)", () => {
    const narrow = foldOnResize(wide, true);
    expect(narrow.open).toBe(false);
    expect(foldOnResize(narrow, false).open).toBe(true);
  });

  it("stays folded after widening when the user had folded it (fails when widening forces it open)", () => {
    const folded = { open: false, narrow: false, openBeforeNarrow: false };
    const narrow = foldOnResize(folded, true);
    expect(foldOnResize(narrow, false).open).toBe(false);
  });

  it("keeps a column the user unfolded while narrow open on widening (fails when widening restores the folded state)", () => {
    const narrow = foldOnResize(
      { open: false, narrow: false, openBeforeNarrow: false },
      true,
    );
    const unfolded = { ...narrow, open: true };
    expect(foldOnResize(unfolded, false).open).toBe(true);
  });
});
