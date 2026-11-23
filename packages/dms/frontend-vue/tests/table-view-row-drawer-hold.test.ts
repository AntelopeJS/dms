/**
 * A live table whose rows open in a drawer holds its rows while one is open,
 * and says why ("Table on hold · row open"), as it does with a side panel.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import {
  mountTableView,
  settleTable,
  tableViewRuntime,
} from "./helpers/table-view-runtime";
import {
  createPageLiveController,
  type PageLiveController,
} from "../layers/dms-ui/app/entries/composables/live/pageLiveController";
import { setCurrentPageLive } from "../layers/dms-ui/app/entries/composables/live/currentPageLive";
import { defined } from "./helpers/defined";

const ROW_OPEN_NOTICE = "dms.live.table_held · dms.live.held_row_open";

const apps: Array<{ unmount: () => void }> = [];
const openDrawers: Array<() => void> = [];
let live: PageLiveController;

beforeEach(async () => {
  await tableViewRuntime(async () => ({
    results: [{ _id: "r1", name: "Order", secret: "kept" }],
    total: 1,
    offset: 0,
    limit: 10,
  }));
  vi.stubGlobal("useOverlay", () => ({
    create: () => ({
      open: () =>
        new Promise<void>((resolve) => {
          openDrawers.push(resolve);
        }),
      close: () => {},
      patch: () => {},
    }),
  }));
  vi.stubGlobal("resolveDmsComponent", () =>
    defineComponent({ render: () => null }),
  );
  vi.stubGlobal("findPageRoute", () => undefined);
  live = createPageLiveController("sales", {});
  setCurrentPageLive(live);
});

afterEach(() => {
  apps.forEach((app) => app.unmount());
  apps.length = 0;
  openDrawers.length = 0;
  live.dispose();
  setCurrentPageLive(null);
  vi.unstubAllGlobals();
});

function notice(host: HTMLElement): string | undefined {
  return host
    .querySelector(".dms-live-hold-banner__reason")
    ?.textContent?.trim();
}

async function openRowIn(
  target:
    | { type: "drawer"; direction: "right" }
    | { type: "modal"; size: "xl" },
): Promise<HTMLElement> {
  const { app, container } = await mountTableView({
    liveHold: { whileOnScreen: false, whileRowOpen: true },
    rowClick: "single",
    rowActions: {
      custom: [
        {
          label: "Order",
          isDefault: true,
          target: { ...target, component: { componentName: "OrderPanel" } },
        },
      ],
    },
  });
  apps.push(app);
  await settleTable();
  expect(notice(container)).toBeUndefined();

  const cell = container.querySelector('tr[data-row-id="r1"] td');
  if (!(cell instanceof HTMLElement)) throw new Error("The row is not drawn");
  cell.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  await vi.waitFor(() => expect(openDrawers).toHaveLength(1));
  await settleTable();
  return container;
}

it("says the table is on hold while a drawer has one of its rows open, and stops once the drawer closes (fails when only a side panel counts as a row open)", async () => {
  const container = await openRowIn({ type: "drawer", direction: "right" });
  expect(notice(container)).toBe(ROW_OPEN_NOTICE);

  defined(openDrawers[0])();
  await settleTable();
  expect(notice(container)).toBeUndefined();
});

it("does not hold for a row open in a modal (fails when every container opened on a row counts as a row open)", async () => {
  const container = await openRowIn({ type: "modal", size: "xl" });
  expect(notice(container)).toBeUndefined();
});
