/** @vitest-environment jsdom */
/**
 * A table with a `deepLink` action opens the row `?record=` names on arrival
 * and on each visit that keeps the page mounted, including a link to a row
 * closed meanwhile: the table removes the key in place, so the route still
 * holds the same value and only the visit tells the link was followed again.
 */
import { createApp, defineComponent, h, nextTick, reactive } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";
import type { DeepLinkedRow } from "../layers/dms-ui/app/build/composables/table-view/utils/recordLink";
import {
  clearWrittenRecord,
  writeRecordId,
} from "../layers/dms-ui/app/build/composables/table-view/utils/recordLink";
import {
  currentQuery,
  withoutQueryParam,
} from "../layers/dms-ui/app/build/composables/table-view/utils/urlFilters";

const { useTableRecordLink } = await import(
  "../layers/dms-ui/app/build/composables/table-view/useTableRecordLink"
);

interface Row {
  id: string;
}

const ROWS: Row[] = [{ id: "r1" }, { id: "r2" }];
const SCOPE = { tableId: "sends", isSoleTableView: true };
const DRAWER = {
  id: "details",
  deepLink: true,
  target: { type: "drawer" },
} as unknown as CustomRowAction;

const mounted: Array<{ unmount: () => void }> = [];

const flush = () => new Promise<void>((done) => setTimeout(done));

/** A visit of the page: Inertia pushes its URL, then announces it. */
async function visit(route: { query: Record<string, unknown> }, url: string) {
  window.history.pushState({}, "", url);
  route.query = Object.fromEntries(new URL(url, "http://x").searchParams);
  await nextTick();
  document.dispatchEvent(
    new CustomEvent("inertia:navigate", { detail: { page: { url } } }),
  );
  await flush();
}

function mountTable(url: string) {
  window.history.replaceState({}, "", url);
  const route = reactive({
    query: Object.fromEntries(new URL(url, "http://x").searchParams) as Record<
      string,
      unknown
    >,
  });
  const opened: string[] = [];
  const notify = vi.fn();
  let link: { shown: (id?: string) => void } | undefined;
  const app = createApp(
    defineComponent({
      setup() {
        link = useTableRecordLink<Row>({
          route,
          urlScope: SCOPE,
          action: DRAWER,
          resolve: async (id): Promise<DeepLinkedRow<Row>> => {
            const row = ROWS.find((candidate) => candidate.id === id);
            return row ? { row, isMissing: false } : { isMissing: true };
          },

          open: (row) => {
            opened.push(row.id);
            writeRecordId(SCOPE, row.id);
            link?.shown(row.id);
          },
          showMissing: () => {},
          notify,
        });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  mounted.push(app);

  const close = () => {
    writeRecordId(SCOPE);
    link?.shown(undefined);
  };
  return { route, opened, notify, close };
}

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  window.history.replaceState({}, "", "/");
});

describe("a record link on a mounted table", () => {
  it("opens the row a link names on arrival, once", async () => {
    const { route, opened } = mountTable("/sends?record=r1");
    await flush();

    document.dispatchEvent(
      new CustomEvent("inertia:navigate", {
        detail: { page: { url: "/sends?record=r1" } },
      }),
    );
    await flush();
    expect(opened).toEqual(["r1"]);
    expect(route.query.record).toBe("r1");
  });

  it("opens the row a visit to the same page names", async () => {
    const { route, opened } = mountTable("/sends?record=r1");
    await flush();
    await visit(route, "/sends?record=r2");
    expect(opened).toEqual(["r1", "r2"]);
    expect(window.location.search).toBe("?record=r2");
  });

  it("opens the same row again after its drawer closed", async () => {
    const { route, opened, close } = mountTable("/sends?record=r1");
    await flush();

    await visit(route, "/sends?record=r1");
    expect(opened).toEqual(["r1"]);

    close();
    expect(window.location.search).toBe("");
    await visit(route, "/sends?record=r1");
    expect(opened).toEqual(["r1", "r1"]);
  });

  it("tells the user a link names no row and removes the key", async () => {
    const { route, opened, notify } = mountTable("/sends?tab=all&record=gone");
    await flush();
    expect(opened).toEqual([]);
    expect(notify).toHaveBeenCalledWith("notify");
    expect(window.location.search).toBe("?tab=all");

    await visit(route, "/sends?tab=all&record=gone");
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("stops following visits once unmounted", async () => {
    const { route, opened } = mountTable("/sends");
    mounted.splice(0).forEach((app) => app.unmount());
    await visit(route, "/sends?record=r2");
    expect(opened).toEqual([]);
  });
});

describe("the URL a closed drawer leaves", () => {
  it("removes only the row this drawer wrote, and says so", () => {
    window.history.replaceState({}, "", "/sends");
    const written = writeRecordId(SCOPE, "r1");
    writeRecordId(SCOPE, "r2");
    expect(clearWrittenRecord(written)).toBe(false);
    expect(window.location.search).toBe("?record=r2");
    expect(clearWrittenRecord(writeRecordId(SCOPE, "r2"))).toBe(true);
    expect(window.location.search).toBe("");
  });

  it("rebuilds a removed filter's visit from the URL the browser shows", () => {
    window.history.replaceState({}, "", "/sends?email=a%40b.test&tab=all");

    const routeQuery = { email: "a@b.test", tab: "all", record: "r1" };
    expect(withoutQueryParam(currentQuery(routeQuery), "email")).toEqual({
      tab: "all",
    });
  });
});
