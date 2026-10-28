/** @vitest-environment jsdom */
/**
 * A form's section link or a refused field scrolls the form's own scroll
 * container only: `scrollIntoView` also scrolled the layout's
 * `overflow: hidden` root, pushing the header out of view for good.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  scrollParent,
  scrollWithin,
} from "../layers/dms-ui/app/build/utils/scrollWithin";

function box(element: HTMLElement, top: number, height: number): void {
  element.getBoundingClientRect = () =>
    ({ top, bottom: top + height, height }) as DOMRect;
}

function scroller(overflowY: string, scrollTop = 0): HTMLDivElement {
  const element = document.createElement("div");
  element.style.overflowY = overflowY;
  Object.defineProperty(element, "scrollHeight", { value: 2000 });
  Object.defineProperty(element, "clientHeight", { value: 500 });
  element.scrollTop = scrollTop;
  element.scrollTo = vi.fn() as typeof element.scrollTo;
  return element;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("scrollWithin", () => {
  it("scrolls the nearest scrolling ancestor, never a hidden one", () => {
    const root = scroller("hidden");
    const main = scroller("auto", 100);
    const section = document.createElement("div");
    section.style.scrollMarginTop = "56px";
    main.append(section);
    root.append(main);
    document.body.append(root);
    box(main, 80, 500);
    box(section, 900, 300);

    expect(scrollParent(section)).toBe(main);
    scrollWithin(section, { block: "start", behavior: "smooth" });

    expect(main.scrollTo).toHaveBeenCalledWith({
      top: 100 + 900 - 80 - 56,
      behavior: "smooth",
    });
    expect(root.scrollTo).not.toHaveBeenCalled();
  });

  it("centres a field in its container", () => {
    const main = scroller("auto");
    const row = document.createElement("div");
    main.append(row);
    document.body.append(main);
    box(main, 0, 500);
    box(row, 1000, 100);

    scrollWithin(row, { block: "center" });

    expect(main.scrollTo).toHaveBeenCalledWith({
      top: 1000 - 200,
      behavior: "auto",
    });
  });

  it("leaves a field already in view where it is on `nearest`", () => {
    const main = scroller("auto");
    const row = document.createElement("div");
    main.append(row);
    document.body.append(main);
    box(main, 0, 500);
    box(row, 100, 50);

    scrollWithin(row, { block: "nearest" });

    expect(main.scrollTo).not.toHaveBeenCalled();
  });

  it("falls back to the window when nothing closer scrolls", () => {
    const row = document.createElement("div");
    document.body.append(row);
    box(row, 700, 40);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    scrollWithin(row);

    expect(scrollTo).toHaveBeenCalledWith({ top: 700, behavior: "auto" });
    scrollTo.mockRestore();
  });
});
