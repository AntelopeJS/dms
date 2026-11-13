import { describe, expect, it } from "vitest";
import { stampedHistory } from "../layers/dms-ui/app/build/utils/mockupStamp";
import { reset } from "../layers/dms-ui/app/entries/utils/mockupHistory";
import type {
  MockupSpecDocument,
  MockupSpecNode,
} from "../layers/dms-ui/app/entries/utils/mockupSpec";

const STAMP = "b-k3j9x0qz";

function kpi(title: string, id?: string): MockupSpecNode {
  const node: MockupSpecNode = { type: "KpiCard", options: { title } };
  if (id !== undefined) node.id = id;
  return node;
}

function grid(...children: MockupSpecNode[]): MockupSpecNode {
  return { type: "Grid", children };
}

function specOf(...tree: MockupSpecNode[]): MockupSpecDocument {
  return { version: 1, pages: [{ id: "home", title: "Home", tree }] };
}

describe("stampedHistory", () => {
  it("takes a file that only adds ids to nodes that had none, and refuses one that changes anything else (fails when another writer's change counts as a stamp)", () => {
    const written = specOf(kpi("A", "a"), kpi("B"));
    const stamped = specOf(kpi("A", "a"), kpi("B", STAMP));
    const retitled = specOf(kpi("A", "a"), kpi("C", STAMP));
    const renamed = specOf(kpi("A", "x"), kpi("B", STAMP));

    expect(stampedHistory(reset(written), written, stamped)?.present).toBe(
      stamped,
    );
    expect(stampedHistory(reset(written), written, retitled)).toBeUndefined();
    expect(stampedHistory(reset(written), written, renamed)).toBeUndefined();
  });

  it("puts the file in the written spec's place and each id on the present at its pointer, even on a node an edit changed (fails when an edit not written yet loses the id)", () => {
    const written = specOf(kpi("A"), grid(kpi("B")));
    const file = specOf(kpi("A"), grid(kpi("B", STAMP)));
    const present = specOf(kpi("A"), grid(kpi("B, edited")));

    const next = stampedHistory(
      { past: [written], present, future: [] },
      written,
      file,
    );

    expect(next?.past[0]).toBe(file);
    expect(next?.present).toEqual(
      specOf(kpi("A"), grid(kpi("B, edited", STAMP))),
    );
  });

  it("gives a step the id where exactly one node without an id equals the stamped node, and none when two do (fails when an undo drops the id, or puts it on a twin)", () => {
    const written = specOf(kpi("A"), kpi("B"));
    const file = specOf(kpi("A"), kpi("B", STAMP));
    const moved = specOf(kpi("B"), kpi("A"));
    const twins = specOf(kpi("B"), kpi("B"));

    const next = stampedHistory(
      { past: [moved, twins], present: written, future: [twins] },
      written,
      file,
    );

    expect(next?.present).toBe(file);
    expect(next?.past).toEqual([specOf(kpi("B", STAMP), kpi("A")), twins]);
    expect(next?.future[0]).toBe(twins);
  });
});
