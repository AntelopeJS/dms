import { describe, expect, it } from "vitest";
import {
  assignSlots,
  fitCamera,
  framesBounds,
  layoutFrames,
  nearbyFrames,
  OVERVIEW_FRAME_WIDTH,
  OVERVIEW_MIN_HEIGHT,
  OVERVIEW_ZOOM,
  pageAt,
  revealCamera,
  toWorld,
  wheelPixels,
  wheelZoomFactor,
  zoomAt,
  type OverviewFrame,
} from "../layers/dms-ui/app/entries/utils/mockupOverview";

const pages = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}` }));

const VIEWPORT = { width: 1200, height: 800 };

function onScreen(
  frame: OverviewFrame,
  camera: { x: number; y: number; zoom: number },
) {
  return {
    left: camera.x + frame.rect.x * camera.zoom,
    top: camera.y + frame.rect.y * camera.zoom,
    right: camera.x + (frame.rect.x + frame.rect.width) * camera.zoom,
    bottom: camera.y + (frame.rect.y + frame.rect.height) * camera.zoom,
  };
}

describe("the frames' layout", () => {
  it("puts up to eight pages in one row, in their order, at the desktop width (fails when the order is lost or the frames overlap)", () => {
    const frames = layoutFrames(pages(8));

    expect(frames.map((frame) => frame.id)).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
      "p8",
    ]);
    expect(new Set(frames.map((frame) => frame.rect.y))).toEqual(new Set([0]));
    for (const [index, frame] of frames.entries()) {
      expect(frame.rect.width).toBe(OVERVIEW_FRAME_WIDTH);
      const next = frames[index + 1];
      if (next) {
        expect(next.rect.x).toBeGreaterThan(frame.rect.x + frame.rect.width);
      }
    }
  });

  it("draws a page at its reported height, and a short or unmeasured one at the least height (fails when a frame shrinks to its content)", () => {
    const frames = layoutFrames([
      { id: "tall", height: 2400 },
      { id: "short", height: 300 },
      { id: "unmeasured" },
    ]);

    expect(frames.map((frame) => frame.rect.height)).toEqual([
      2400,
      OVERVIEW_MIN_HEIGHT,
      OVERVIEW_MIN_HEIGHT,
    ]);
  });

  it("wraps more than eight pages into rows of even length, each below the tallest frame of the row above (fails when 10 pages make a row of 8 and one of 2, or rows overlap)", () => {
    const frames = layoutFrames(
      pages(10).map((page, index) => ({
        ...page,
        height: index === 2 ? 3000 : 1000,
      })),
    );
    const rows = Map.groupBy(frames, (frame) => frame.rect.y);

    expect(
      [...rows.values()].map((row) => row.map((frame) => frame.id)),
    ).toEqual([
      ["p1", "p2", "p3", "p4", "p5"],
      ["p6", "p7", "p8", "p9", "p10"],
    ]);
    expect(frames[5]?.rect.x).toBe(frames[0]?.rect.x);
    expect(frames[5]?.rect.y).toBeGreaterThan(3000);
  });

  it("keeps rows as even as can be when the pages do not split evenly", () => {
    const sizes = (count: number) =>
      [
        ...Map.groupBy(
          layoutFrames(pages(count)),
          (frame) => frame.rect.y,
        ).values(),
      ].map((row) => row.length);

    expect(sizes(9)).toEqual([5, 4]);
    expect(sizes(17)).toEqual([6, 6, 5]);
  });
});

describe("zooming", () => {
  it("keeps the point under the cursor in place (fails when zoom scales around the canvas's corner)", () => {
    const camera = { x: 40, y: -120, zoom: 0.25 };
    const cursor = { x: 700, y: 310 };

    for (const zoom of [0.5, 0.1, 1.7]) {
      const zoomed = zoomAt(camera, zoom, cursor);
      expect(zoomed.zoom).toBe(zoom);
      expect(toWorld(zoomed, cursor).x).toBeCloseTo(toWorld(camera, cursor).x);
      expect(toWorld(zoomed, cursor).y).toBeCloseTo(toWorld(camera, cursor).y);
    }
  });

  it("stops at the least and the most zoom, still around the cursor (fails when the clamp drifts the canvas)", () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const cursor = { x: 300, y: 200 };

    const out = zoomAt(camera, 0.0001, cursor);
    const zoomedIn = zoomAt(camera, 50, cursor);

    expect(out.zoom).toBe(OVERVIEW_ZOOM.min);
    expect(zoomedIn.zoom).toBe(OVERVIEW_ZOOM.max);
    expect(toWorld(out, cursor).x).toBeCloseTo(300);
    expect(toWorld(zoomedIn, cursor).y).toBeCloseTo(200);
  });

  it("zooms in on a wheel turned up and out on one turned down, one mouse notch a bounded step (fails when a notch jumps past the next step)", () => {
    expect(wheelZoomFactor(-4)).toBeGreaterThan(1);
    expect(wheelZoomFactor(4)).toBeLessThan(1);
    expect(wheelZoomFactor(100)).toBe(wheelZoomFactor(1000));
    expect(wheelZoomFactor(100)).toBeGreaterThan(0.7);
  });

  it("reads a wheel counted in lines as pixels, and Shift with a plain wheel as a sideways pan", () => {
    const wheel = (init: Partial<WheelEvent>) => ({
      deltaX: 0,
      deltaY: 0,
      deltaMode: 0,
      shiftKey: false,
      ...init,
    });

    expect(wheelPixels(wheel({ deltaY: 3, deltaMode: 1 }), VIEWPORT)).toEqual({
      x: 0,
      y: 48,
    });
    expect(
      wheelPixels(wheel({ deltaY: 120, shiftKey: true }), VIEWPORT),
    ).toEqual({ x: 120, y: 0 });
  });
});

describe("fitting every page", () => {
  it("shows every frame inside the viewport, off its edges, centred (fails when a frame is cut off or the canvas sits in a corner)", () => {
    const frames = layoutFrames(pages(10));
    const camera = fitCamera(framesBounds(frames)!, VIEWPORT, 48);
    const boxes = frames.map((frame) => onScreen(frame, camera));

    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(48 - 0.001);
      expect(box.top).toBeGreaterThanOrEqual(48 - 0.001);
      expect(box.right).toBeLessThanOrEqual(VIEWPORT.width - 48 + 0.001);
      expect(box.bottom).toBeLessThanOrEqual(VIEWPORT.height - 48 + 0.001);
    }
    const left = Math.min(...boxes.map((box) => box.left));
    const right = Math.max(...boxes.map((box) => box.right));
    expect(left).toBeCloseTo(VIEWPORT.width - right);
  });

  it("never zooms a single page past its real size", () => {
    const camera = fitCamera(
      { x: 0, y: 0, width: 400, height: 300 },
      VIEWPORT,
      48,
    );
    expect(camera.zoom).toBe(1);
  });
});

describe("bringing a frame into view", () => {
  const frames = layoutFrames(pages(5));
  const camera = { x: 40, y: 60, zoom: 0.25 };

  it("pans the least that shows a frame off to the right, at the same zoom (fails when it recentres or zooms)", () => {
    const frame = frames[4]!;
    const revealed = revealCamera(camera, frame.rect, VIEWPORT, 32);

    expect(revealed.zoom).toBe(camera.zoom);
    expect(revealed.y).toBe(camera.y);
    expect(onScreen(frame, revealed).right).toBeCloseTo(VIEWPORT.width - 32);
  });

  it("leaves the camera alone when the frame is already in view", () => {
    expect(revealCamera(camera, frames[0]!.rect, VIEWPORT, 32)).toEqual(camera);
  });

  it("shows a frame larger than the viewport from its top left corner", () => {
    const frame = frames[3]!;
    const revealed = revealCamera(
      { x: 0, y: 0, zoom: 1 },
      frame.rect,
      VIEWPORT,
      32,
    );
    expect(onScreen(frame, revealed).left).toBeCloseTo(32);
    expect(onScreen(frame, revealed).top).toBeCloseTo(32);
  });
});

describe("the page under the pointer", () => {
  const frames = layoutFrames(pages(3));
  const camera = { x: 50, y: 80, zoom: 0.5 };

  it("names the frame's page and the point of that page, whatever the pan and the zoom (fails when the point is read on the canvas, not the page)", () => {
    const second = frames[1]!.rect;
    const at = {
      x: camera.x + (second.x + 640) * camera.zoom,
      y: camera.y + (second.y + 200) * camera.zoom,
    };

    expect(pageAt(frames, camera, at)).toEqual({
      page: "p2",
      point: { x: 640, y: 200 },
    });
  });

  it("names no page between two frames", () => {
    const first = frames[0]!.rect;
    const at = {
      x: camera.x + (first.x + first.width + 20) * camera.zoom,
      y: camera.y + 100 * camera.zoom,
    };
    expect(pageAt(frames, camera, at)).toBeUndefined();
  });
});

describe("the frames drawn live", () => {
  const frames = layoutFrames(pages(8));

  it("keeps to the frames in view and within half a viewport of it, nearest first (fails when every frame of the mockup loads)", () => {
    const camera = {
      x: VIEWPORT.width / 2 - (frames[3]!.rect.x + OVERVIEW_FRAME_WIDTH / 2),
      y: 0,
      zoom: 1,
    };

    expect(nearbyFrames(frames, camera, VIEWPORT)).toEqual(["p4", "p3", "p5"]);
    const zoomedOut = { ...camera, zoom: 0.2, x: 0 };
    expect(nearbyFrames(frames, zoomedOut, VIEWPORT).slice(0, 2)).toEqual([
      "p3",
      "p2",
    ]);
    expect(nearbyFrames(frames, zoomedOut, VIEWPORT)).not.toContain("p8");
  });

  it("gives each wanted page a slot up to the capacity, nearest first (fails when the pool grows past it)", () => {
    expect(assignSlots([], ["p1", "p2", "p3"], 2)).toEqual(["p1", "p2"]);
  });

  it("keeps a page in the slot it had, so its iframe is not redrawn (fails when slots are reassigned in order)", () => {
    expect(assignSlots(["p1", "p2", "p3"], ["p3", "p1", "p2"], 3)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
  });

  it("hands a page newly in view the slot of the page wanted least, and keeps the others (fails when a slot in view is taken)", () => {
    expect(
      assignSlots(["p1", "p2", "p3"], ["p4", "p2", "p3", "p1"], 3),
    ).toEqual(["p4", "p2", "p3"]);
    expect(assignSlots(["p1", "p2", "p3"], ["p5", "p2", "p1"], 3)).toEqual([
      "p1",
      "p2",
      "p5",
    ]);
  });

  it("leaves a slot drawing its page while nothing needs it, ready for a pan back", () => {
    expect(assignSlots(["p1", "p2"], ["p2"], 4)).toEqual(["p1", "p2"]);
  });
});
