// @vitest-environment jsdom
/**
 * A `drawer` row action takes the row options of a side panel: the DMS's row
 * header (`rowTitle`, the position, previous / next), J and K, `?record=`
 * deep links (`deepLink` on the target), the not-found state and `size`.
 */
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
  type Component,
  type Ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActionTargets } from "../layers/dms-ui/app/build/composables/actions/useActionTargets";
import type {
  RowLocation,
  RowNavigationSource,
} from "../layers/dms-ui/app/build/composables/actions/rowNavigation";
import type { RowNavigation } from "../layers/dms-ui/app/types/row-navigation";
import RowHeader from "../layers/dms-ui/app/build/components/containers/row/RowHeader.vue";
import RowNotFound from "../layers/dms-ui/app/build/components/containers/row/RowNotFound.vue";
import {
  deepLinkOutcome,
  isDeepLinkAction,
} from "../layers/dms-ui/app/build/composables/table-view/utils/recordLink";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";
import { useTableRows } from "../layers/dms-ui/app/build/composables/table-view/useTableRows";
import { rowLocator } from "../layers/dms-ui/app/build/composables/table-view/utils/locateRow";

const PANEL_COMPONENT = "OrderPanel";

interface Row {
  _id: string;
  name: string;
}

interface OpenedDrawer {
  options: Record<string, unknown>;
  patches: Array<Record<string, unknown>>;
  close: () => void;
}

const rows: Row[] = [
  { _id: "r1", name: "First" },
  { _id: "r2", name: "Second" },
  { _id: "r3", name: "Third" },
];

let app: App | undefined;
let opened: OpenedDrawer[];

const Panel = defineComponent({ render: () => null });

function installRuntime(): void {
  const runtime: Record<string, unknown> = {
    computed,
    ref,
    markRaw: <T>(value: T) => value,
    Color: { success: "success" },
    HttpMethod: { post: "POST" },
    interpolateUrl: (url: string) => url,
    resolveDmsComponent: (name: string) =>
      name === PANEL_COMPONENT ? Panel : undefined,
    useI18n: () => ({
      locale: ref("fr-FR"),
      t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}(${params.index}/${params.total})` : key,
    }),
    useTranslation: () => ({
      processI18n: (value: string, params?: Record<string, unknown>) =>
        params ? `${value}(${params.index}/${params.total})` : value,
      processApiMessage: (value: string) => value,
    }),
    useToast: () => ({ add: vi.fn() }),
    useModal: () => ({ open: vi.fn() }),
    useDrawer: () => ({
      open: (options: Record<string, unknown>) => {
        let settle!: () => void;
        const result = new Promise<void>((resolve) => {
          settle = resolve;
        });
        const drawer: OpenedDrawer = {
          options,
          patches: [],
          close: () => settle(),
        };
        opened.push(drawer);
        return {
          result,
          close: drawer.close,
          patch: (patch: Record<string, unknown>) => drawer.patches.push(patch),
        };
      },
    }),
    useExportJob: () => ({ runJob: vi.fn() }),
    useConfirm: () => ({ confirm: vi.fn(async () => true) }),
    useAuthFetch: () => ({ $authFetch: vi.fn() }),
  };
  Object.entries(runtime).forEach(([name, value]) =>
    vi.stubGlobal(name, value),
  );
}

const drawerAction = (
  target: Record<string, unknown> = {},
  action: Partial<CustomRowAction> = {},
): CustomRowAction => ({
  label: "Order",
  isDefault: true,
  target: {
    type: "drawer",
    direction: "right",
    component: { componentName: PANEL_COMPONENT },
    title: "Order details",
    ...target,
  } as CustomRowAction["target"],
  ...action,
});

function mountTargets(
  shownRows: Ref<Row[]> = ref(rows),
  paging: Partial<RowNavigationSource> = {},
): ReturnType<typeof useActionTargets> {
  let targets: ReturnType<typeof useActionTargets> | undefined;
  app = createApp(
    defineComponent({
      setup() {
        targets = useActionTargets({
          api: vi.fn() as never,
          pageId: "orders-page",
          componentId: "orders",
          handleApiError: vi.fn(),
          rowNavigation: {
            rows: () => shownRows.value,
            rowIdKey: "_id",
            ...paging,
          },
          recordScope: { tableId: "orders", isSoleTableView: true },
        });
        return () => h("table");
      },
    }),
  );
  app.mount(document.createElement("div"));
  return targets!;
}

const latest = (drawer: OpenedDrawer) =>
  Object.assign({}, drawer.options, ...drawer.patches) as Record<
    string,
    unknown
  >;
const headerOf = (drawer: OpenedDrawer) =>
  latest(drawer).headerComponentOptions as
    | { heading: string; positionLabel?: string; navigation?: RowNavigation }
    | undefined;

const press = (key: string) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));

const openOn = async (action: CustomRowAction, row: Row = rows[0]!) => {
  const targets = mountTargets();
  targets.handleCustomRowAction(action, row as unknown as Data);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  return { targets, drawer: opened[0]! };
};

beforeEach(() => {
  opened = [];
  installRuntime();
  window.history.replaceState(null, "", "/orders");
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("a row drawer's header", () => {
  it("draws the row header with the row's title and position", async () => {
    const { drawer } = await openOn(
      drawerAction({ rowTitle: "{name}", positionLabel: "$orders.position" }),
    );
    expect(drawer.options.headerComponent).toBe(RowHeader);
    expect(drawer.options.title).toBe("First");
    const header = headerOf(drawer)!;
    expect(header.heading).toBe("First");
    expect(header.positionLabel).toBe("$orders.position");
    expect(header.navigation).toMatchObject({ index: 0, total: 3 });
  });

  it("is drawn with the defaults on `rowHeader: true`", async () => {
    const { drawer } = await openOn(drawerAction({ rowHeader: true }));
    expect(headerOf(drawer)?.heading).toBe("Order details");
  });

  it("leaves the drawer's own header without row options", async () => {
    const { drawer } = await openOn(drawerAction());
    expect(drawer.options.headerComponent).toBeUndefined();
    expect(drawer.options.title).toBe("Order details");
  });

  it("is not drawn on `rowHeader: false`, the title still naming the row", async () => {
    const { drawer } = await openOn(
      drawerAction({ rowTitle: "{name}", rowHeader: false }),
    );
    expect(drawer.options.headerComponent).toBeUndefined();
    expect(drawer.options.title).toBe("First");
  });

  it("steps to the next and previous rows in place with J and K", async () => {
    const { drawer } = await openOn(
      drawerAction({ rowTitle: "{name}", positionLabel: "$orders.position" }),
    );
    press("j");
    expect(latest(drawer).title).toBe("Second");
    expect(headerOf(drawer)?.navigation).toMatchObject({ index: 1 });
    expect(latest(drawer).componentKey).toBe("r2");
    press("k");
    expect(headerOf(drawer)?.heading).toBe("First");
    expect(opened).toHaveLength(1);
  });

  it("steps with the header's buttons", async () => {
    const { drawer } = await openOn(drawerAction({ positionLabel: "$p" }));
    headerOf(drawer)!.navigation!.next();
    expect(headerOf(drawer)?.navigation).toMatchObject({ index: 1 });
  });

  it("passes the size, and remembers it per table and component", async () => {
    const { drawer } = await openOn(drawerAction({ size: "3xl" }));
    expect(drawer.options.size).toBe("3xl");
    expect(drawer.options.sizeKey).toBe(
      `orders-page-orders-${PANEL_COMPONENT}`,
    );
  });
});

describe("a row drawer's steps across the table's pages", () => {
  const PAGE_SIZE = 2;
  const allRows: Row[] = Array.from({ length: 5 }, (_, index) => ({
    _id: `p${index}`,
    name: `Row ${index}`,
  }));

  // A table listing 5 rows 2 per page: turning the page loads its rows.
  function pagedTable() {
    const pageIndex = ref(0);
    const shown = ref<Row[]>(allRows.slice(0, PAGE_SIZE));
    const loadAdjacent = vi.fn(async (step: 1 | -1) => {
      const next = pageIndex.value + step;
      if (next < 0 || next * PAGE_SIZE >= allRows.length) return false;
      await new Promise((resolve) => setTimeout(resolve));
      pageIndex.value = next;
      shown.value = allRows.slice(next * PAGE_SIZE, (next + 1) * PAGE_SIZE);
      return true;
    });
    const targets = mountTargets(shown, {
      total: () => allRows.length,
      offset: () => pageIndex.value * PAGE_SIZE,
      loadAdjacent,
    });
    return { targets, loadAdjacent };
  }

  const navigationOf = (drawer: OpenedDrawer) => headerOf(drawer)!.navigation!;

  it("counts every row the table lists, not the page loaded", async () => {
    const { targets } = pagedTable();
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1] as unknown as Data,
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(navigationOf(opened[0]!)).toMatchObject({
      index: 1,
      total: 5,
      hasNext: true,
    });
  });

  it("loads the next page past the last row loaded, and steps back", async () => {
    const { targets, loadAdjacent } = pagedTable();
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1] as unknown as Data,
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    press("j");
    await vi.waitFor(() => expect(latest(drawer).componentKey).toBe("p2"));
    expect(loadAdjacent).toHaveBeenCalledWith(1);
    expect(navigationOf(drawer)).toMatchObject({ index: 2, total: 5 });
    press("k");
    await vi.waitFor(() => expect(latest(drawer).componentKey).toBe("p1"));
    expect(loadAdjacent).toHaveBeenLastCalledWith(-1);
    expect(navigationOf(drawer)).toMatchObject({ index: 1 });
  });

  it("stops at the table's last row", async () => {
    const { targets, loadAdjacent } = pagedTable();
    await loadAdjacent(1);
    await loadAdjacent(1);
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[4] as unknown as Data,
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(navigationOf(opened[0]!)).toMatchObject({
      index: 4,
      total: 5,
      hasNext: false,
      hasPrev: true,
    });
  });

  it("grows a feed in place: the next row follows the open one", async () => {
    const shown = ref<Row[]>(allRows.slice(0, PAGE_SIZE));
    const targets = mountTargets(shown, {
      total: () => allRows.length,
      loadAdjacent: async (step) => {
        if (step < 0) return false;
        shown.value = allRows.slice(0, shown.value.length + PAGE_SIZE);
        return true;
      },
    });
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1] as unknown as Data,
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    navigationOf(opened[0]!).next();
    await vi.waitFor(() => expect(latest(opened[0]!).componentKey).toBe("p2"));
    expect(navigationOf(opened[0]!)).toMatchObject({ index: 2, total: 5 });
  });

  it("keeps to the rows loaded without a loader", async () => {
    const targets = mountTargets(ref(allRows.slice(0, PAGE_SIZE)), {
      total: () => allRows.length,
    });
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1] as unknown as Data,
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(navigationOf(opened[0]!)).toMatchObject({
      index: 1,
      total: 5,
      hasNext: false,
    });
  });

  it("lands on no closed drawer", async () => {
    const { targets, loadAdjacent } = pagedTable();
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1] as unknown as Data,
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    press("j");
    drawer.close();
    await vi.waitFor(() => expect(loadAdjacent).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(latest(drawer).componentKey).not.toBe("p2");
  });
});

describe("a row drawer off the rows loaded", () => {
  const allRows: Row[] = Array.from({ length: 6 }, (_, index) => ({
    _id: `q${index}`,
    name: `Row ${index}`,
  }));

  // Finds a row in `all`, as a table reads its whole result.
  const locateIn = (all: () => Row[]) =>
    vi.fn(async (id: string): Promise<RowLocation | undefined> => {
      const rowsNow = all() as unknown as Data[];
      const index = rowsNow.findIndex((row) => row._id === id);
      if (index < 0) return undefined;
      return {
        index,
        total: rowsNow.length,
        prev: rowsNow[index - 1],
        next: rowsNow[index + 1],
      };
    });

  const navigationOf = (drawer: OpenedDrawer) => headerOf(drawer)?.navigation;

  it("locates a deep-linked row past the page loaded, and steps from it", async () => {
    const locate = locateIn(() => allRows);
    const targets = mountTargets(ref(allRows.slice(0, 2)), {
      total: () => allRows.length,
      locate,
    });
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[4] as unknown as Data,
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    await vi.waitFor(() =>
      expect(navigationOf(drawer)).toMatchObject({
        index: 4,
        total: 6,
        hasPrev: true,
        hasNext: true,
      }),
    );
    expect(locate).toHaveBeenCalledWith("q4", undefined);
    press("j");
    await vi.waitFor(() => expect(latest(drawer).componentKey).toBe("q5"));
    await vi.waitFor(() =>
      expect(navigationOf(drawer)).toMatchObject({ index: 5, hasNext: false }),
    );
  });

  it("follows live rows by id: never revisits a row, keeps the position", async () => {
    const live = ref<Row[]>(allRows.slice(0, 3));
    const targets = mountTargets(live, {
      total: () => live.value.length,
      locate: locateIn(() => live.value),
    });
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1] as unknown as Data,
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    // A new row arrives on top: the open row moves down one.
    live.value = [{ _id: "new", name: "New" }, ...live.value];
    expect(navigationOf(drawer)).toMatchObject({ index: 2, total: 4 });
    press("j");
    expect(latest(drawer).componentKey).toBe("q2");
    press("k");
    expect(latest(drawer).componentKey).toBe("q1");
  });

  it("locates the open row once live rows push it out of the rows loaded", async () => {
    const all = ref<Row[]>(allRows.slice(0, 4));
    const loaded = computed(() => all.value.slice(0, 2));
    const targets = mountTargets(loaded as unknown as Ref<Row[]>, {
      total: () => all.value.length,
      locate: locateIn(() => all.value),
    });
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1] as unknown as Data,
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    all.value = [
      { _id: "a", name: "A" },
      { _id: "b", name: "B" },
      ...all.value,
    ];
    await vi.waitFor(() =>
      expect(navigationOf(drawer)).toMatchObject({ index: 3, total: 6 }),
    );
    press("j");
    await vi.waitFor(() => expect(latest(drawer).componentKey).toBe("q2"));
  });
});

describe("a row drawer on a table with pinned rows", () => {
  const PAGE_SIZE = 3;
  // The order the route answers; v1 and v4 are pinned.
  const answered = Array.from({ length: 7 }, (_, index) => ({
    _id: `v${index}`,
    name: `Row ${index}`,
    isVip: index === 1 || index === 4,
  }));
  // Pages of 3, each leading with its own pinned rows.
  const shownOrder = ["v1", "v0", "v2", "v4", "v3", "v5", "v6"];
  const byId = (id: string) => answered.find((row) => row._id === id)!;
  const pageRows = (pageIndex: number) =>
    shownOrder
      .slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)
      .map(byId);

  // The table shown on its second page: v4, v3, v5.
  function secondPage() {
    const rowsRead = useTableRows({
      api: (async (
        _url: string,
        { query }: { query: Record<string, number> },
      ) => ({
        results: answered.slice(query.offset, query.offset + query.limit),
        total: answered.length,
      })) as never,
      location: "/api/customers",
      columns: [],
      pinnedRows: () => ({ field: "isVip", equals: true }),
    });
    const locate = rowLocator({
      list: async (offset, limit) => {
        const page = await rowsRead.listAsShown({ offset, limit }, PAGE_SIZE);
        return page && { results: page.results as Data[], total: page.total };
      },
      rowIdKey: "_id",
    });
    const loadAdjacent = vi.fn(async () => false);
    const targets = mountTargets(ref(pageRows(1)) as unknown as Ref<Row[]>, {
      total: () => answered.length,
      offset: () => PAGE_SIZE,
      loadAdjacent,
      locate,
    });
    return { targets, loadAdjacent };
  }

  const navigationOf = (drawer: OpenedDrawer) => headerOf(drawer)?.navigation;

  it("places a clicked row where the table shows it, and steps in its order", async () => {
    const { targets, loadAdjacent } = secondPage();
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      byId("v3") as unknown as Data,
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    expect(navigationOf(drawer)).toMatchObject({ index: 4, total: 7 });
    press("k");
    expect(latest(drawer).componentKey).toBe("v4");
    expect(navigationOf(drawer)).toMatchObject({ index: 3 });
    press("j");
    press("j");
    expect(latest(drawer).componentKey).toBe("v5");
    expect(navigationOf(drawer)).toMatchObject({ index: 5 });
    // Stepping within the page shown never turns it.
    expect(loadAdjacent).not.toHaveBeenCalled();
  });

  it("places a deep-linked row off the page as the table shows it, keeping the page", async () => {
    const { targets, loadAdjacent } = secondPage();
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      byId("v2") as unknown as Data,
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    // v2 closes page 1 (v1, v0, v2): the 3rd row, before v4 opening page 2.
    await vi.waitFor(() =>
      expect(navigationOf(drawer)).toMatchObject({
        index: 2,
        total: 7,
        hasPrev: true,
        hasNext: true,
      }),
    );
    press("j");
    await vi.waitFor(() => expect(latest(drawer).componentKey).toBe("v4"));
    await vi.waitFor(() =>
      expect(navigationOf(drawer)).toMatchObject({ index: 3 }),
    );
    expect(loadAdjacent).not.toHaveBeenCalled();
  });
});

describe("the row header", () => {
  const mountHeader = (props: Record<string, unknown>) => {
    const host = document.createElement("div");
    app = createApp({ render: () => h(RowHeader as Component, props) });
    app.component(
      "UButton",
      defineComponent({
        props: { disabled: Boolean },
        emits: ["click"],
        setup:
          (buttonProps, { emit, attrs }) =>
          () =>
            h("button", {
              ...attrs,
              disabled: buttonProps.disabled,
              onClick: () => emit("click"),
            }),
      }),
    );
    app.mount(host);
    return host;
  };

  const navigation = (index: number, next = vi.fn()): RowNavigation => ({
    index,
    total: 50,
    hasPrev: index > 0,
    hasNext: index < 49,
    prev: vi.fn(),
    next,
  });

  it("words the position with the label, else the default", async () => {
    let host = mountHeader({
      part: "dms-row-drawer",
      heading: "Request",
      positionLabel: "$api.request.position",
      navigation: navigation(3),
    });
    expect(
      host.querySelector("[data-dms-row-drawer-position]")?.textContent?.trim(),
    ).toBe("$api.request.position(4/50)");
    app!.unmount();
    host = mountHeader({ part: "dms-row-drawer", navigation: navigation(0) });
    expect(
      host.querySelector("[data-dms-row-drawer-position]")?.textContent?.trim(),
    ).toBe("side_panel.position(1/50)");
    expect(
      host.querySelector<HTMLButtonElement>("[data-dms-row-drawer-prev]")
        ?.disabled,
    ).toBe(true);
  });

  it("groups the figures as the locale does", () => {
    const host = mountHeader({
      part: "dms-row-drawer",
      navigation: { ...navigation(26_119), total: 26_120 },
    });
    expect(
      host
        .querySelector("[data-dms-row-drawer-position]")
        ?.textContent?.trim()
        .replace(/\s/g, " "),
    ).toBe("side_panel.position(26 120/26 120)");
  });

  it("moves to the next row from its button", async () => {
    const next = vi.fn();
    const host = mountHeader({
      part: "dms-row-drawer",
      navigation: navigation(3, next),
    });
    host.querySelector<HTMLElement>("[data-dms-row-drawer-next]")!.click();
    await nextTick();
    expect(next).toHaveBeenCalledOnce();
  });

  it("wraps a long title onto two lines before cutting it", () => {
    const heading = "Inverter offline since the storm, site 26 (north roof)";
    const host = mountHeader({ part: "dms-row-drawer", heading });
    const title = host.querySelector("h2")!;
    expect(title.className).toContain("line-clamp-2");
    expect(title.className).not.toContain("truncate");
    expect(title.title).toBe(heading);
  });

  it("draws no position nor buttons without navigation", () => {
    const host = mountHeader({ part: "dms-row-drawer", heading: "Request" });
    expect(host.querySelector("[data-dms-row-drawer-position]")).toBeNull();
    expect(host.querySelector("[data-dms-row-drawer-next]")).toBeNull();
  });
});

describe("a row drawer's deep link", () => {
  it("is opted into on the target, the action's own setting winning", () => {
    expect(isDeepLinkAction(drawerAction())).toBe(false);
    expect(isDeepLinkAction(drawerAction({ deepLink: true }))).toBe(true);
    expect(
      isDeepLinkAction(drawerAction({ deepLink: true }, { deepLink: false })),
    ).toBe(false);
    expect(isDeepLinkAction(drawerAction({}, { deepLink: true }))).toBe(true);
  });

  it("keeps the open row in the URL, follows J, and removes it on close", async () => {
    const action = drawerAction({ deepLink: true });
    const { drawer } = await openOn(action);
    expect(window.location.search).toBe("?record=r1");
    press("j");
    expect(window.location.search).toBe("?record=r2");
    drawer.close();
    await vi.waitFor(() => expect(window.location.search).toBe(""));
  });
});

describe("a row drawer's not-found state", () => {
  it("shows the drawer's state on a missing row once the target words it", () => {
    const found = { isMissing: true } as const;
    expect(deepLinkOutcome(found, drawerAction())).toBe("notify");
    expect(
      deepLinkOutcome(found, drawerAction({ notFound: { title: "Gone" } })),
    ).toBe("missingPanel");
  });

  it("opens the state under the target's title, and closing it removes the link", async () => {
    const targets = mountTargets();
    const action = drawerAction({
      deepLink: true,
      notFound: { title: "$orders.gone", description: "$orders.gone_text" },
    });
    targets.handleMissingRow(action, "r9");
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    expect(drawer.options.component).toBe(RowNotFound);
    expect(drawer.options.title).toBe("Order details");
    expect(drawer.options.componentOptions).toMatchObject({
      title: "$orders.gone",
      description: "$orders.gone_text",
    });
    expect(window.location.search).toBe("?record=r9");
    (drawer.options.componentOptions as { onClose: () => void }).onClose();
    await vi.waitFor(() => expect(window.location.search).toBe(""));
  });

  it("opens nothing for a drawer without a not-found state", () => {
    const targets = mountTargets();
    targets.handleMissingRow(drawerAction({ deepLink: true }), "r9");
    expect(opened).toHaveLength(0);
  });
});
