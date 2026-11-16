import { describe, expect, it } from "vitest";
import {
  buildCascaderPathLabels,
  buildCascaderTree,
  cascaderValuePath,
  findCascaderNode,
  flattenCascaderTree,
  formatCascaderPath,
  isCascaderNodeSelectable,
  readCascaderAncestry,
  resolveCascaderKeyMapping,
  searchCascaderTree,
  type CascaderKeyMapping,
} from "../layers/dms-ui/app/utils/cascader";

const keyMapping: CascaderKeyMapping = {
  label: "name",
  value: "_id",
  parent: "parent_id",
  disabled: "inactive",
};

interface CategoryRow extends Record<string, unknown> {
  _id: string;
  name: string;
  parent_id: string | null;
  inactive?: boolean;
}

const categories: CategoryRow[] = [
  { _id: "electronics", name: "Electronics", parent_id: null },
  { _id: "audio", name: "Audio", parent_id: "electronics" },
  { _id: "headphones", name: "Headphones", parent_id: "audio" },
  { _id: "speakers", name: "Speakers", parent_id: "audio" },
  { _id: "video", name: "Video", parent_id: "electronics", inactive: true },
  { _id: "tv", name: "TV", parent_id: "video" },
  { _id: "garden", name: "Garden", parent_id: null },
];

describe("buildCascaderTree", () => {
  it("rebuilds the tree from a flat list", () => {
    const roots = buildCascaderTree(categories, keyMapping);

    expect(roots.map((node) => node.value)).toEqual(["electronics", "garden"]);
    const audio = findCascaderNode(roots, "audio");
    expect(audio?.children.map((node) => node.value)).toEqual([
      "headphones",
      "speakers",
    ]);
    expect(audio?.depth).toBe(2);
    expect(audio?.pathLabels).toEqual(["Electronics", "Audio"]);
  });

  it("treats rows with a missing parent as roots", () => {
    const roots = buildCascaderTree(
      [
        { _id: "a", name: "A", parent_id: null },
        { _id: "orphan", name: "Orphan", parent_id: "missing" },
      ],
      keyMapping,
    );

    expect(roots.map((node) => node.value)).toEqual(["a", "orphan"]);
  });

  it("drops rows trapped in a parent cycle", () => {
    const roots = buildCascaderTree(
      [
        { _id: "a", name: "A", parent_id: "b" },
        { _id: "b", name: "B", parent_id: "a" },
        { _id: "root", name: "Root", parent_id: null },
      ],
      keyMapping,
    );

    expect(flattenCascaderTree(roots).map((node) => node.value)).toEqual([
      "root",
    ]);
  });

  it("disables the entire subtree of a disabled node", () => {
    const roots = buildCascaderTree(categories, keyMapping);

    expect(findCascaderNode(roots, "video")?.disabled).toBe(true);
    expect(findCascaderNode(roots, "tv")?.disabled).toBe(true);
    expect(findCascaderNode(roots, "audio")?.disabled).toBe(false);
  });

  it("prunes nodes deeper than maxDepth", () => {
    const roots = buildCascaderTree(categories, keyMapping, { maxDepth: 2 });

    const depths = flattenCascaderTree(roots).map((node) => node.depth);
    expect(Math.max(...depths)).toBe(2);
    expect(findCascaderNode(roots, "headphones")).toBeUndefined();
    expect(findCascaderNode(roots, "audio")?.children).toEqual([]);
  });
});

describe("searchCascaderTree", () => {
  it("matches on the full path, case-insensitively", () => {
    const roots = buildCascaderTree(categories, keyMapping);

    const matches = searchCascaderTree(roots, "electronics / audio");
    expect(matches.map((node) => node.value)).toEqual([
      "audio",
      "headphones",
      "speakers",
    ]);
  });

  it("finds a node by its own label", () => {
    const roots = buildCascaderTree(categories, keyMapping);

    const matches = searchCascaderTree(roots, "HeadPhones");
    expect(matches.map((node) => formatCascaderPath(node))).toEqual([
      "Electronics / Audio / Headphones",
    ]);
  });

  it("returns nothing for a blank query", () => {
    const roots = buildCascaderTree(categories, keyMapping);

    expect(searchCascaderTree(roots, "  ")).toEqual([]);
  });

  it("keeps disabled nodes in the results", () => {
    const roots = buildCascaderTree(categories, keyMapping);

    const matches = searchCascaderTree(roots, "tv");
    expect(matches.map((node) => node.value)).toEqual(["tv"]);
    expect(matches[0]?.disabled).toBe(true);
  });
});

describe("isCascaderNodeSelectable", () => {
  const roots = buildCascaderTree(categories, keyMapping);

  it("rejects disabled nodes", () => {
    expect(isCascaderNodeSelectable(findCascaderNode(roots, "video")!)).toBe(
      false,
    );
  });

  it("allows intermediate nodes unless leafOnly is set", () => {
    const audio = findCascaderNode(roots, "audio")!;
    expect(isCascaderNodeSelectable(audio)).toBe(true);
    expect(isCascaderNodeSelectable(audio, { leafOnly: true })).toBe(false);
    expect(
      isCascaderNodeSelectable(findCascaderNode(roots, "headphones")!, {
        leafOnly: true,
      }),
    ).toBe(true);
  });

  it("rejects nodes deeper than maxDepth", () => {
    const headphones = findCascaderNode(roots, "headphones")!;
    expect(isCascaderNodeSelectable(headphones, { maxDepth: 2 })).toBe(false);
    expect(isCascaderNodeSelectable(headphones, { maxDepth: 3 })).toBe(true);
  });
});

describe("buildCascaderPathLabels", () => {
  it("resolves the full label path from the flat list", () => {
    expect(
      buildCascaderPathLabels(categories, keyMapping, "headphones"),
    ).toEqual(["Electronics", "Audio", "Headphones"]);
  });

  it("returns an empty array for an unknown value", () => {
    expect(buildCascaderPathLabels(categories, keyMapping, "nope")).toEqual([]);
  });

  it("stops at a parent cycle without looping", () => {
    const rows = [
      { _id: "a", name: "A", parent_id: "b" },
      { _id: "b", name: "B", parent_id: "a" },
    ];
    expect(buildCascaderPathLabels(rows, keyMapping, "a")).toEqual(["B", "A"]);
  });
});

describe("cascaderValuePath", () => {
  it("resolves a picked id, or a picked row, to its path", () => {
    expect(cascaderValuePath("speakers", keyMapping, categories)).toEqual([
      "Electronics",
      "Audio",
      "Speakers",
    ]);
    expect(
      cascaderValuePath({ _id: "tv", name: "TV" }, keyMapping, categories),
    ).toEqual(["Electronics", "Video", "TV"]);
  });

  it("shows a picked row's own label, or its id, until the rows are there", () => {
    expect(cascaderValuePath({ _id: "tv", name: "TV" }, keyMapping)).toEqual([
      "TV",
    ]);
    expect(cascaderValuePath("tv", keyMapping)).toEqual(["tv"]);
    expect(cascaderValuePath("nope", keyMapping, categories)).toEqual(["nope"]);
  });

  it("has no path for nothing picked", () => {
    expect(cascaderValuePath(null, keyMapping, categories)).toEqual([]);
    expect(cascaderValuePath({ name: "Loose" }, keyMapping)).toEqual(["Loose"]);
  });
});

describe("readCascaderAncestry", () => {
  function selectRoute(rows: CategoryRow[]) {
    const reads: string[][] = [];
    const read = async (ids: string[]) => {
      reads.push([...ids].sort());
      return rows.filter((row) => ids.includes(row._id));
    };
    return { read, reads };
  }

  it("reads the picked rows, then each level of their ancestors once", async () => {
    const { read, reads } = selectRoute(categories);
    const { rows, notFound } = await readCascaderAncestry(read, keyMapping, [
      "headphones",
      "speakers",
      "tv",
    ]);

    expect(reads).toEqual([
      ["headphones", "speakers", "tv"],
      ["audio", "video"],
      ["electronics"],
    ]);
    expect(notFound).toEqual([]);
    expect(buildCascaderPathLabels(rows, keyMapping, "headphones")).toEqual([
      "Electronics",
      "Audio",
      "Headphones",
    ]);
  });

  it("names the picked ids no row answers, and stops at a missing parent", async () => {
    const { read, reads } = selectRoute(
      categories.filter((row) => row._id !== "audio"),
    );
    const { rows, notFound } = await readCascaderAncestry(read, keyMapping, [
      "headphones",
      "gone",
    ]);
    expect(notFound).toEqual(["gone"]);
    expect(reads).toEqual([["gone", "headphones"], ["audio"]]);
    expect(buildCascaderPathLabels(rows, keyMapping, "headphones")).toEqual([
      "Headphones",
    ]);
  });

  it("ends on a parent cycle", async () => {
    const cycle = [
      { _id: "a", name: "A", parent_id: "b" },
      { _id: "b", name: "B", parent_id: "a" },
    ];
    const { read, reads } = selectRoute(cycle);
    await readCascaderAncestry(read, keyMapping, ["a"]);
    expect(reads).toEqual([["a"], ["b"]]);
  });
});

describe("resolveCascaderKeyMapping", () => {
  it("falls back to default keys", () => {
    expect(resolveCascaderKeyMapping()).toEqual({
      label: "label",
      value: "value",
      parent: "parent",
    });
    expect(resolveCascaderKeyMapping({ label: "name" }).label).toBe("name");
  });
});
