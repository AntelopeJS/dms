import { describe, expect, it } from "vitest";
import { horizontalScrollEdges } from "../layers/dms-ui/app/build/composables/table/utils/scrollEdges";

describe("Table horizontal scroll fades", () => {
  const area = (scrollLeft: number, scrollWidth = 1250, clientWidth = 340) => ({
    scrollLeft,
    scrollWidth,
    clientWidth,
  });

  it("fades the sides that still hide columns", () => {
    expect(horizontalScrollEdges(area(0))).toEqual({ start: false, end: true });
    expect(horizontalScrollEdges(area(400))).toEqual({
      start: true,
      end: true,
    });
    expect(horizontalScrollEdges(area(910))).toEqual({
      start: true,
      end: false,
    });

    expect(horizontalScrollEdges(area(-400))).toEqual({
      start: true,
      end: true,
    });
  });

  it("fades nothing on a table that fits its card", () => {
    expect(horizontalScrollEdges(area(0, 340.5, 340))).toEqual({
      start: false,
      end: false,
    });
  });
});
