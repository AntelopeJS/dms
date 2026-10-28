/** @vitest-environment jsdom */
/**
 * The resize logic shared by the side panels and the drawers: a handle on
 * the inner edge of a sheet, dragged or driven by the keyboard, and the
 * per-drawer size cookie with its bounds.
 */
import { ref, type Ref } from "vue";
import { describe, expect, it } from "vitest";
import {
  RESIZE_KEYBOARD_STEP_PX,
  type ResizeBounds,
  type ResizeSide,
  type ResizeStorage,
  useResizableSize,
} from "../layers/dms-ui/app/build/composables/containers/useResizableSize";
import {
  DEFAULT_SIDE_DRAWER_WIDTH,
  DRAWER_SIZE_WIDTHS,
  type DrawerSizePreferences,
  drawerSizeStorage,
  MIN_SIDE_DRAWER_WIDTH,
  readDrawerSizePreferences,
  resolveDrawerSizeBounds,
} from "../layers/dms-ui/app/build/composables/containers/drawerSize";

const BOUNDS: ResizeBounds = { defaultSize: 600, minSize: 360, maxSize: 900 };

function memoryStorage(initial?: number): ResizeStorage & {
  stored: Ref<number | undefined>;
} {
  const value = ref<number | undefined>(initial);
  return {
    stored: value,
    read: () => value.value,
    write: (size) => {
      value.value = size;
    },
  };
}

const pointer = (clientX: number, clientY = 0) =>
  new PointerEvent("pointermove", { clientX, clientY });
const key = (name: string) => new KeyboardEvent("keydown", { key: name });

function resizable(
  side: ResizeSide,
  storage = memoryStorage(),
  bounds: ResizeBounds = BOUNDS,
) {
  return { storage, ...useResizableSize({ side, bounds, storage }) };
}

describe("a resizable sheet", () => {
  it("opens at its default size until it is resized", () => {
    expect(resizable("right").size.value).toBe(600);
  });

  it("reads the stored size, within its bounds", () => {
    expect(resizable("right", memoryStorage(700)).size.value).toBe(700);
    expect(resizable("right", memoryStorage(5000)).size.value).toBe(900);
    expect(resizable("right", memoryStorage(10)).size.value).toBe(360);
  });

  it.each([
    ["right", pointer(500), pointer(400), 700],
    ["left", pointer(500), pointer(400), 500],
    ["bottom", pointer(0, 500), pointer(0, 400), 700],
    ["top", pointer(0, 500), pointer(0, 400), 500],
  ] as const)(
    "follows a drag of its %s handle and stores the size it ends at",
    (side, start, move, expected) => {
      const sheet = resizable(side);
      sheet.startDrag(start, 600);
      expect(sheet.isDragging.value).toBe(true);
      sheet.drag(move);
      expect(sheet.size.value).toBe(expected);
      expect(sheet.storage.stored.value).toBeUndefined();
      sheet.endDrag();
      expect(sheet.isDragging.value).toBe(false);
      expect(sheet.storage.stored.value).toBe(expected);
    },
  );

  it("stops a drag at its bounds", () => {
    const sheet = resizable("right");
    sheet.startDrag(pointer(500), 600);
    sheet.drag(pointer(-2000));
    expect(sheet.size.value).toBe(900);
    sheet.drag(pointer(2000));
    expect(sheet.size.value).toBe(360);
  });

  it("holds the drag in a shared live size", () => {
    const liveSize = ref<number | null>(null);
    const sheet = useResizableSize({
      side: "right",
      bounds: BOUNDS,
      storage: memoryStorage(),
      liveSize,
    });
    sheet.startDrag(pointer(500), 600);
    sheet.drag(pointer(450));
    expect(liveSize.value).toBe(650);
    sheet.endDrag();
    expect(liveSize.value).toBe(null);
  });

  it.each([
    ["right", "ArrowLeft", "ArrowRight"],
    ["left", "ArrowRight", "ArrowLeft"],
    ["bottom", "ArrowUp", "ArrowDown"],
    ["top", "ArrowDown", "ArrowUp"],
  ] as const)(
    "grows a %s sheet with %s and shrinks it with %s",
    (side, growKey, shrinkKey) => {
      const sheet = resizable(side);
      sheet.resizeFromKey(key(growKey));
      expect(sheet.storage.stored.value).toBe(600 + RESIZE_KEYBOARD_STEP_PX);
      sheet.resizeFromKey(key(shrinkKey));
      sheet.resizeFromKey(key(shrinkKey));
      expect(sheet.storage.stored.value).toBe(600 - RESIZE_KEYBOARD_STEP_PX);
    },
  );

  it("jumps to its bounds with Home and End, and ignores other keys", () => {
    const sheet = resizable("right");
    sheet.resizeFromKey(key("End"));
    expect(sheet.size.value).toBe(900);
    sheet.resizeFromKey(key("Home"));
    expect(sheet.size.value).toBe(360);
    sheet.resizeFromKey(key("a"));
    expect(sheet.storage.stored.value).toBe(360);
  });

  it("gives its default size back on a reset", () => {
    const sheet = resizable("right", memoryStorage(800));
    sheet.reset();
    expect(sheet.storage.stored.value).toBe(600);
  });

  it("keeps a natural size until resized, from its rendered size", () => {
    const sheet = resizable("bottom", memoryStorage(), {
      minSize: 240,
      maxSize: 700,
    });
    expect(sheet.size.value).toBeUndefined();
    sheet.resizeFromKey(key("ArrowUp"));
    expect(sheet.storage.stored.value).toBeUndefined();
    sheet.resizeFromKey(key("ArrowUp"), 400);
    expect(sheet.size.value).toBe(400 + RESIZE_KEYBOARD_STEP_PX);
    sheet.reset();
    expect(sheet.size.value).toBeUndefined();
  });
});

describe("a drawer's size bounds", () => {
  const wide = { width: 1600, height: 900 };

  it("opens a side drawer at 600px without a size", () => {
    expect(resolveDrawerSizeBounds("right", wide)).toEqual({
      defaultSize: DEFAULT_SIDE_DRAWER_WIDTH,
      minSize: MIN_SIDE_DRAWER_WIDTH,
      maxSize: 1440,
    });
  });

  it("clamps the 600px to the room the window leaves", () => {
    const bounds = resolveDrawerSizeBounds("left", { width: 640, height: 800 });
    expect(bounds.maxSize).toBe(576);
    expect(bounds.defaultSize).toBe(576);
  });

  it("keeps the modal width of an explicit size", () => {
    expect(resolveDrawerSizeBounds("right", wide, "3xl").defaultSize).toBe(
      DRAWER_SIZE_WIDTHS["3xl"],
    );
    expect(resolveDrawerSizeBounds("right", wide, "sm").defaultSize).toBe(384);
  });

  it("spans the window at `full`", () => {
    const bounds = resolveDrawerSizeBounds("right", wide, "full");
    expect(bounds.defaultSize).toBe(1600);
    expect(bounds.maxSize).toBe(1600);
  });

  it("leaves a bottom drawer at its natural height, up to 90% of the window", () => {
    expect(resolveDrawerSizeBounds("bottom", wide, "3xl")).toEqual({
      minSize: 240,
      maxSize: 810,
    });
  });
});

describe("a drawer's stored size", () => {
  const preferences = () =>
    ref<DrawerSizePreferences>({ widths: {}, heights: {} });

  it("is kept per key, widths and heights apart", () => {
    const stored = preferences();
    drawerSizeStorage(stored, "orders", "right").write(720);
    drawerSizeStorage(stored, "orders", "bottom").write(500);
    drawerSizeStorage(stored, "invoices", "right").write(480);
    expect(stored.value).toEqual({
      widths: { orders: 720, invoices: 480 },
      heights: { orders: 500 },
    });
    expect(drawerSizeStorage(stored, "orders", "left").read()).toBe(720);
    expect(drawerSizeStorage(stored, "invoices", "top").read()).toBeUndefined();
  });

  it("forgets a size written as undefined", () => {
    const stored = preferences();
    const storage = drawerSizeStorage(stored, "orders", "bottom");
    storage.write(500);
    storage.write(undefined);
    expect(stored.value.heights).toEqual({});
  });

  it("drops the oldest sizes past its limit", () => {
    const stored = preferences();
    for (let index = 0; index < 45; index += 1) {
      drawerSizeStorage(stored, `drawer-${index}`, "right").write(400 + index);
    }
    const keys = Object.keys(stored.value.widths);
    expect(keys).toHaveLength(40);
    expect(keys[0]).toBe("drawer-5");
    expect(stored.value.widths["drawer-44"]).toBe(444);
  });

  it("keeps a keyless drawer's size to itself", () => {
    const stored = preferences();
    const storage = drawerSizeStorage(stored, undefined, "right");
    storage.write(700);
    expect(storage.read()).toBe(700);
    expect(stored.value.widths).toEqual({});
  });

  it("reads a hand-edited cookie defensively", () => {
    expect(readDrawerSizePreferences("nonsense")).toEqual({
      widths: {},
      heights: {},
    });
    expect(
      readDrawerSizePreferences({ widths: { a: 500, b: "wide" }, heights: 3 }),
    ).toEqual({ widths: { a: 500 }, heights: {} });
  });
});
