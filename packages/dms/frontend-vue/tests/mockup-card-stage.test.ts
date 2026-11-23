import { expect, it } from "vitest";
import type { MockupSummary } from "../layers/dms-ui/app/entries/utils/mockup";
import {
  badgeOf,
  isMockupName,
  stageOf,
} from "../layers/dms-ui/app/entries/utils/mockupCard";

const UPDATED = "2026-11-13T10:00:00.000Z";

function builtInto(
  pages: number,
  built: Array<{ changed: boolean }>,
): MockupSummary {
  return {
    name: "desk",
    pages,
    openComments: 0,
    updatedAt: UPDATED,
    status: "built",
    builtAt: UPDATED,
    builtPages: built.map(({ changed }, index) => ({
      path: `/page-${index}`,
      title: `Page ${index}`,
      changed,
    })),
  };
}

it("reads the stage from the built pages against the spec's pages, and a changed page outranks the count (fails on counting a changed page as progress, calling a build that skipped pages Built, or calling a spec with more built pages than pages partial)", () => {
  const unchanged = { changed: false };

  expect(stageOf({ ...builtInto(2, []), status: "draft" })).toEqual({
    kind: "draft",
  });
  expect(stageOf(builtInto(5, [unchanged, unchanged]))).toEqual({
    kind: "partial",
    built: 2,
    total: 5,
  });
  expect(stageOf(builtInto(2, [unchanged, unchanged]))).toEqual({
    kind: "built",
  });
  expect(stageOf(builtInto(1, [unchanged, unchanged]))).toEqual({
    kind: "built",
  });
  expect(stageOf(builtInto(5, [unchanged, { changed: true }]))).toEqual({
    kind: "out-of-sync",
  });
});

it("gives each stage its own colour and the progress its counts (fails on a progress badge with no counts for its text, or two stages coloured alike)", () => {
  const badges = [
    badgeOf({ kind: "draft" }),
    badgeOf({ kind: "partial", built: 2, total: 5 }),
    badgeOf({ kind: "built" }),
    badgeOf({ kind: "out-of-sync" }),
  ];

  expect(new Set(badges.map(({ color }) => color)).size).toBe(4);
  expect(badges[1]?.params).toEqual({ built: 2, total: 5 });
});

it("accepts the names the API accepts and refuses the rest (fails on a rename reaching a path, an uppercase name, or a name the mockup API answers on its own routes)", () => {
  expect(["desk", "bike-rental-2", "0-start"].every(isMockupName)).toBe(true);
  expect(
    [
      "",
      "Desk",
      "a b",
      "../x",
      "-dash",
      "schema",
      "example",
      "a".repeat(65),
    ].some(isMockupName),
  ).toBe(false);
});
