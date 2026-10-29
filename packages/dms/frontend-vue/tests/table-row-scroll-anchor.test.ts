/** @vitest-environment jsdom */
/**
 * Rows added above the ones the reader scrolled to (a live list's new rows)
 * do not push them down: the table scrolls as far as they moved, in the same
 * frame. At the top of the list the new rows show, and a reorder, a filter or
 * another page is left alone.
 */
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  ROW_ID_ATTRIBUTE,
  useRowScrollAnchor,
} from "../layers/dms-ui/app/entries/composables/table/useRowScrollAnchor";

const ROW_HEIGHT = 40;
const VIEW_HEIGHT = 200;

let app: App | undefined;
let scroller: HTMLDivElement;
let scrollTop = 0;
const ids = ref<string[]>([]);
const boundingRect = Element.prototype.getBoundingClientRect;

function layOut(): void {
  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  Object.defineProperty(scroller, "scrollHeight", {
    configurable: true,
    get: () => ids.value.length * ROW_HEIGHT,
  });
  Object.defineProperty(scroller, "clientHeight", {
    configurable: true,
    get: () => VIEW_HEIGHT,
  });
  scroller.getBoundingClientRect = () => new DOMRect();
  const rowTop = (row: Element) =>
    [...scroller.querySelectorAll("tr")].indexOf(row) * ROW_HEIGHT - scrollTop;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return new DOMRect(0, rowTop(this));
  };
}

function mount(): void {
  const Rows = defineComponent({
    setup() {
      const root = ref<HTMLElement | null>(null);
      useRowScrollAnchor(root, () => ids.value);
      return () =>
        h("table", { ref: root }, [
          h(
            "tbody",
            ids.value.map((id) =>
              h("tr", { key: id, [ROW_ID_ATTRIBUTE]: id }, id),
            ),
          ),
        ]);
    },
  });
  app = createApp(Rows);
  app.mount(scroller);
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, index) => `row-${from + index}`);

beforeEach(() => {
  scroller = document.createElement("div");
  scroller.style.overflowY = "auto";
  document.body.append(scroller);
  ids.value = range(0, 20);
  scrollTop = 0;
  layOut();
  mount();
});

afterEach(() => {
  app?.unmount();
  scroller.remove();
  Element.prototype.getBoundingClientRect = boundingRect;
});

it("keeps the rows in view where they were when rows land above them", async () => {
  scrollTop = 6 * ROW_HEIGHT;
  ids.value = ["new-a", "new-b", ...range(0, 18)];
  await nextTick();
  expect(scrollTop).toBe(8 * ROW_HEIGHT);
});

it("shows the new rows at the top of the list", async () => {
  ids.value = ["new-a", "new-b", ...range(0, 18)];
  await nextTick();
  expect(scrollTop).toBe(0);
});

it("leaves a reorder alone", async () => {
  scrollTop = 6 * ROW_HEIGHT;
  ids.value = [...range(0, 20)].reverse();
  await nextTick();
  expect(scrollTop).toBe(6 * ROW_HEIGHT);
});

it("leaves another page alone", async () => {
  scrollTop = 6 * ROW_HEIGHT;
  ids.value = range(20, 40);
  await nextTick();
  expect(scrollTop).toBe(6 * ROW_HEIGHT);
});
