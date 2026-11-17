/**
 * A FullAgenda whose legend filters on the server (`legend.serverFilter`),
 * mounted with its real engine: it reads its route with the calendars the
 * legend shows, from the first read, which a server render makes at once.
 */
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it, vi } from "vitest";
import { useAgendaBlockHarness } from "./fixtures/agendaBlockHarness";
import FullAgendaBlock from "../layers/dms-ui/app/components/blocks/FullAgendaBlock.vue";

useAgendaBlockHarness();

describe("an agenda whose legend filters on the server", () => {
  it("reads its route with the calendars shown (fails when the block cannot set up, or sends no calendars)", async () => {
    const route = vi.fn(
      (_url: string, _request?: { query?: { calendars?: string } }) =>
        Promise.resolve({ events: [] }),
    );
    vi.stubGlobal("useAuthFetch", () => ({ $authFetch: route }));
    vi.stubGlobal("useDmsRoute", () => ({ query: {}, params: {} }));
    vi.stubGlobal("useModal", () => ({ open: vi.fn() }));
    vi.stubGlobal("useDrawer", () => ({ open: vi.fn() }));
    vi.stubGlobal("useExportJob", () => ({ runJob: vi.fn() }));
    vi.stubGlobal("useClipboard", () => ({ copy: vi.fn() }));
    vi.stubGlobal("useConfirm", () => ({ confirm: vi.fn(async () => true) }));
    const app = createSSRApp({
      render: () =>
        h(FullAgendaBlock, {
          componentId: "bookings",
          pageId: "bookings",
          fetchUrl: "/api/bookings/events",
          calendars: [
            { id: "ana", label: "Ana" },
            { id: "ben", label: "Ben" },
          ],
          legend: { serverFilter: true },
        }),
    });
    await renderToString(app);
    expect(route).toHaveBeenCalled();
    const [, request] = route.mock.lastCall ?? [];
    expect(request?.query?.calendars).toBe("ana,ben");
  });
});
