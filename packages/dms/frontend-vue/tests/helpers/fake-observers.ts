import { vi } from "vitest";

let created: FakeObserver[] = [];

/** Stands in for the browser's observers: it records them and fires them on demand. */
class FakeObserver {
  constructor(readonly callback: (entries: unknown[]) => void) {
    created.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class FakeIntersectionObserver extends FakeObserver {}
class FakeResizeObserver extends FakeObserver {}

/** Replaces `IntersectionObserver` and `ResizeObserver` until `vi.unstubAllGlobals()`. */
export function stubObservers(): void {
  created = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
}

/** Every element observed for visibility scrolls into view. */
export function scrollAllIntoView(): void {
  for (const observer of created) {
    if (observer instanceof FakeIntersectionObserver) {
      observer.callback([{ isIntersecting: true, time: 1 }]);
    }
  }
}

/** Every element observed for its size is now `width` wide. */
export function resizeAll(width: number): void {
  for (const observer of created) {
    if (observer instanceof FakeResizeObserver) {
      observer.callback([{ contentRect: { width } }]);
    }
  }
}
