import { describe, expect, it } from "vitest";
import {
  GRID_TRACKS_VAR,
  gridCollapsedCellStyles,
  gridColumnsTemplate,
  gridResponsiveStyles,
  gridScopeId,
} from "../layers/dms-ui/app/components/grid/columns";

const GAP = "1rem";
const MIN = "240px";

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

  it("gives rows of the same grid one shared template, so they stay aligned", () => {
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

  it("reads a unitless gap or minimum as pixels, which calc() requires", () => {
    const template = gridColumnsTemplate(2, "0", "160");
    expect(template).toContain("(100% - 1 * 0px)");
    expect(template).toContain("max(160px,");
    expect(resolveColumnCount(template, 553, 0)).toBe(2);
    const css = gridResponsiveStyles(gridScopeId("nested"), 2, "0", MIN);
    expect(css).toContain(`calc(2 * ${MIN} + 1 * 0px)`);
  });

  it("honours a caller-supplied minimum", () => {
    expect(gridColumnsTemplate(4, GAP, "120px")).toContain("120px");
    expect(
      resolveColumnCount(gridColumnsTemplate(4, GAP, "120px"), 657, 16),
    ).toBe(4);
  });
});

describe("grid responsive styles", () => {
  const scope = gridScopeId("grid-child-row1");

  it("hides spacers only below the width every column needs", () => {
    const css = gridResponsiveStyles(scope, 5, GAP, MIN);
    const spacerRule = css
      .split("\n")
      .find((rule) => rule.includes(".dms-spacer"));
    expect(spacerRule).toContain(
      `@container ${scope} (width < calc(5 * 240px + 4 * 1rem))`,
    );
    expect(spacerRule).toContain(`[data-dms-grid="${scope}"] > .dms-spacer`);
    expect(spacerRule).toContain(
      `[data-dms-grid="${scope}"] > :has(> .dms-spacer)`,
    );
    expect(css.match(/\.dms-spacer, /g)).toHaveLength(1);
  });

  it("hands the cells each narrower track count, narrowest last", () => {
    const rules = gridResponsiveStyles(scope, 4, GAP, MIN).split("\n");
    expect(rules).toHaveLength(3);
    expect(rules[0]).toContain("(width < calc(4 * 240px + 3 * 1rem))");
    expect(rules[0]).toContain(`${GRID_TRACKS_VAR}: 3;`);
    expect(rules[1]).toContain("(width < calc(3 * 240px + 2 * 1rem))");
    expect(rules[1]).toContain(`${GRID_TRACKS_VAR}: 2;`);
    expect(rules[2]).toContain("(width < calc(2 * 240px + 1 * 1rem))");
    expect(rules[2]).toContain(`${GRID_TRACKS_VAR}: 1;`);
  });

  it("agrees with the template on where a track drops", () => {
    // 5 columns of 240px with 16px gaps need 1264px: one pixel less reflows.
    const template = gridColumnsTemplate(5, GAP, MIN);
    expect(resolveColumnCount(template, 1264, 16)).toBe(5);
    expect(resolveColumnCount(template, 1263, 16)).toBe(4);
    expect(resolveColumnCount(template, 1007, 16)).toBe(3);
    expect(resolveColumnCount(template, 1008, 16)).toBe(4);
  });

  it("gives a single-column grid no rules", () => {
    expect(gridResponsiveStyles(scope, 1, GAP, MIN)).toBe("");
    expect(gridResponsiveStyles(scope, 0, GAP, MIN)).toBe("");
  });

  it("builds a valid container name from any id", () => {
    expect(gridScopeId("v-0-1")).toBe("dms-grid-v-0-1");
    expect(gridScopeId("a.b:c d")).toBe("dms-grid-a_b_c_d");
  });
});

describe("grid collapsed cell styles", () => {
  const scope = gridScopeId("grid-child-row2");
  const cells = `[data-dms-grid="${scope}"] > `;

  it("takes no track for a cell its block leaves empty, but keeps spacers", () => {
    const [hide] = gridCollapsedCellStyles(scope, 2).split("\n");
    expect(hide).toBe(`${cells}:empty:not(.dms-spacer) { display: none; }`);
  });

  it("widens the last filled cell over each run of trailing empty cells", () => {
    const rules = gridCollapsedCellStyles(scope, 3).split("\n");
    expect(rules).toHaveLength(3);
    expect(rules[1]).toContain(
      ":has(+ :empty:not(.dms-spacer) + style:last-child)",
    );
    expect(rules[1]).toContain(
      `grid-column: span min(2, var(${GRID_TRACKS_VAR}, 2));`,
    );
    expect(rules[2]).toContain(
      ":has(+ :empty:not(.dms-spacer) + :empty:not(.dms-spacer) + style:last-child)",
    );
    expect(rules[2]).toContain(
      `grid-column: span min(3, var(${GRID_TRACKS_VAR}, 3));`,
    );
  });

  it("gives a single-column row no rules", () => {
    expect(gridCollapsedCellStyles(scope, 1)).toBe("");
    expect(gridCollapsedCellStyles(scope, 0)).toBe("");
  });
});
