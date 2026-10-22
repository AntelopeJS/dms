// @vitest-environment jsdom
/**
 * A table view declaring `mobileDisplay` opens a phone on it once mounted —
 * cards rather than a grid cut after its first columns — unless a display was
 * chosen. The phone's display becomes the default the preference compares
 * with, so it is never saved as the user's choice.
 */
import { createApp, defineComponent, h, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PHONE_VIEWPORT_QUERY,
  useMobileDisplay,
} from "../layers/dms-ui/app/build/composables/table-view/useMobileDisplay";
import type { TableViewViewStateConfig } from "../layers/dms-ui/app/composables/table-view/types";

const OFFERED = new Set(["table", "cards"]);
const mounted: Array<{ unmount: () => void }> = [];

function setViewport(isPhone: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: isPhone && query === PHONE_VIEWPORT_QUERY,
  })) as unknown as typeof window.matchMedia;
}

function mountTable(
  mobileDisplay: string | undefined,
  isDisplayChosen = false,
  activeView?: TableViewViewStateConfig,
) {
  const display = ref("table");
  const displayDefault = ref("table");
  const Table = defineComponent({
    setup() {
      useMobileDisplay({
        mobileDisplay,
        defaultDisplay: displayDefault,
        offered: OFFERED,
        display,
        activeView: ref(activeView),
        isDisplayChosen: () => isDisplayChosen,
      });
      return () => h("div");
    },
  });
  const app = createApp(Table);
  app.mount(document.createElement("div"));
  mounted.push(app);
  return { display, displayDefault };
}

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

describe("a table view's display on phones", () => {
  it("opens a phone on its mobileDisplay, which becomes the default", () => {
    setViewport(true);
    const { display, displayDefault } = mountTable("cards");
    expect(display.value).toBe("cards");
    expect(displayDefault.value).toBe("cards");
  });

  it("keeps the default display on a wide screen", () => {
    setViewport(false);
    const { display, displayDefault } = mountTable("cards");
    expect(display.value).toBe("table");
    expect(displayDefault.value).toBe("table");
  });

  it("keeps a display someone chose", () => {
    setViewport(true);
    expect(mountTable("cards", true).display.value).toBe("table");
  });

  it("keeps the display an open view fixes, not the default of one that sets none", () => {
    setViewport(true);
    expect(mountTable("cards", false, { display: "table" }).display.value).toBe(
      "table",
    );
    expect(mountTable("cards", false, { search: "x" }).display.value).toBe(
      "cards",
    );
    expect(
      mountTable("cards", false, { display: "kanban" }).display.value,
    ).toBe("cards");
  });

  it("ignores a display the table does not offer, or none", () => {
    setViewport(true);
    expect(mountTable("kanban").display.value).toBe("table");
    expect(mountTable(undefined).display.value).toBe("table");
  });
});
