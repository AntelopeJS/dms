import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gridColumnsTemplate } from "../layers/dms-ui/app/components/grid/columns";

const GAP = "1rem";
const MIN = "240px";

const sourceOf = (file: string) =>
  readFileSync(
    new URL(`../layers/dms-ui/app/components/grid/${file}`, import.meta.url),
    "utf8",
  );

// Guards the exact-fit case: at the width where the track floor is precisely
// one Nth of the container, binary floats land a hair under the integer.
const FIT_EPSILON = 1e-6;

/**
 * Resolves the template the way a browser would, in pixels, and reports how
 * many tracks `auto-fill` ends up with for a given container width.
 */
function resolveColumnCount(
  template: string,
  containerWidth: number,
  gapPx: number,
): number {
  const match = template.match(
    /repeat\(auto-fill, minmax\(min\(100%, max\((\d+)px, \(100% - (\d+) \* [^)]+\) \/ (\d+)\)\), 1fr\)\)/,
  );
  if (!match) throw new Error(`unexpected template: ${template}`);
  const [, min, gapCount, maxColumns] = match;
  const share =
    (containerWidth - Number(gapCount) * gapPx) / Number(maxColumns);
  const floor = Math.min(containerWidth, Math.max(Number(min), share));
  if (floor <= 0) return Number(maxColumns);
  return Math.max(
    1,
    Math.floor((containerWidth + gapPx) / (floor + gapPx) + FIT_EPSILON),
  );
}

describe("grid column template", () => {
  it("keeps every column at the widest row's count once the container is wide", () => {
    const template = gridColumnsTemplate(6, GAP, MIN);
    expect(resolveColumnCount(template, 1600, 16)).toBe(6);
    expect(resolveColumnCount(template, 2400, 16)).toBe(6);
  });

  it("drops columns rather than shrinking them below the minimum", () => {
    const template = gridColumnsTemplate(6, GAP, MIN);
    expect(resolveColumnCount(template, 976, 16)).toBe(3);
    expect(resolveColumnCount(template, 657, 16)).toBe(2);
    expect(resolveColumnCount(template, 328, 16)).toBe(1);
  });

  it("never asks for a track wider than the container", () => {
    const template = gridColumnsTemplate(4, GAP, MIN);
    expect(template).toContain("min(100%,");
    expect(resolveColumnCount(template, 200, 16)).toBe(1);
  });

  it("gives every row holding the same count one template, so they line up", () => {
    expect(gridColumnsTemplate(4, GAP, MIN)).toBe(
      gridColumnsTemplate(4, GAP, MIN),
    );
    expect(gridColumnsTemplate(4, GAP, MIN)).not.toBe(
      gridColumnsTemplate(3, GAP, MIN),
    );
  });

  it("treats a row-less grid as a single column", () => {
    expect(gridColumnsTemplate(0, GAP, MIN)).toBe(
      gridColumnsTemplate(1, GAP, MIN),
    );
    expect(resolveColumnCount(gridColumnsTemplate(1, GAP, MIN), 976, 16)).toBe(
      1,
    );
  });

  it("subtracts the gaps the row actually renders", () => {
    expect(gridColumnsTemplate(3, "2rem", MIN)).toContain("(100% - 2 * 2rem)");
    expect(gridColumnsTemplate(1, GAP, MIN)).toContain("(100% - 0 * 1rem)");
  });

  it("honours a caller-supplied minimum", () => {
    expect(gridColumnsTemplate(4, GAP, "120px")).toContain("120px");
    expect(
      resolveColumnCount(gridColumnsTemplate(4, GAP, "120px"), 657, 16),
    ).toBe(4);
  });
});

describe("grid components", () => {
  it("drive both the container and its rows from the shared template", () => {
    for (const file of ["Grid.vue", "GridRow.vue"]) {
      const source = sourceOf(file);
      expect(source).toContain("gridColumnsTemplate(");
      expect(source).not.toMatch(/repeat\(\$\{/);
    }
  });

  it("keeps rows spanning the full grid width", () => {
    expect(sourceOf("GridRow.vue")).toContain('gridColumn: "1 / -1"');
  });
});
