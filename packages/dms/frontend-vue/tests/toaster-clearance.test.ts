// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type App, createApp, defineComponent, h, nextTick, ref } from "vue";
import {
  TOASTER_CLEARANCE_VAR,
  toasterClearance,
  trackToasterClearance,
} from "../layers/dms-ui/app/build/composables/form/toasterClearance";

const VIEWPORT_HEIGHT = 800;

const box = (top: number, bottom: number) => ({
  top,
  bottom,
  height: bottom - top,
});

it("clears the highest bar anchored to the bottom edge", () => {
  // The floating save bar: 50px tall, 16px off the edge.
  expect(toasterClearance([box(734, 784)], VIEWPORT_HEIGHT)).toBe(66);
  // A drawer's footer band, flush with the edge, under a taller one.
  expect(
    toasterClearance([box(734, 784), box(700, 800)], VIEWPORT_HEIGHT),
  ).toBe(100);
});

it("leaves the corner to bars away from the bottom edge", () => {
  // A short form's bar, ending mid-page.
  expect(toasterClearance([box(400, 450)], VIEWPORT_HEIGHT)).toBe(0);
  // A bar scrolled below the viewport, and a collapsed one.
  expect(toasterClearance([box(820, 870)], VIEWPORT_HEIGHT)).toBe(0);
  expect(toasterClearance([box(800, 800)], VIEWPORT_HEIGHT)).toBe(0);
  expect(toasterClearance([], VIEWPORT_HEIGHT)).toBe(0);
});

let app: App | undefined;
let host: HTMLDivElement;
const isShown = ref(true);

const clearance = () =>
  document.documentElement.style.getPropertyValue(TOASTER_CLEARANCE_VAR);

const flushFrame = async () => {
  await nextTick();
  vi.runAllTimers();
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
  vi.stubGlobal("innerHeight", VIEWPORT_HEIGHT);
  isShown.value = true;
  host = document.createElement("div");
  document.body.append(host);
  app = createApp(
    defineComponent({
      setup() {
        const bar = ref<HTMLElement>();
        trackToasterClearance(
          () => bar.value,
          () => isShown.value,
        );
        return () => h("div", { ref: bar });
      },
    }),
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 734, width: 600, height: 50 }),
  );
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("lifts the toaster while a shown bar sits on the bottom edge", async () => {
  app!.mount(host);
  await flushFrame();
  expect(clearance()).toBe("66px");

  isShown.value = false;
  await flushFrame();
  expect(clearance()).toBe("");

  isShown.value = true;
  await flushFrame();
  expect(clearance()).toBe("66px");

  app!.unmount();
  app = undefined;
  await flushFrame();
  expect(clearance()).toBe("");
});
