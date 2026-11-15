import type { JsonValue } from "@antelopejs/interface-dms/json";
import type { PageInfo } from "@antelopejs/interface-dms/page";
import { expect } from "chai";
import { isToolAllowed } from "../../../mcp/access";
import {
  compareWithMockup,
  listFailures,
  type MemberRoles,
  pickMember,
  type PageProbe,
  type PageReport,
  pairBlocks,
  readDataBlocks,
  readLayout,
  type RenderedBlock,
  resolvePage,
  withoutEditor,
} from "../../../mcp/page-verify";
import type {
  BrowserContext,
  Locator,
  Page,
} from "../../../mcp/page-verify/playwright";
import { MCP_TOOLS } from "../../../mcp/tools";
import { pagesBySlug } from "../../../utils";

const ORDER_SLUG = "sales/orders/:orderId";

function orderPage(): PageInfo {
  return {
    id: "order",
    fullId: "sales.order",
    fullSlug: ORDER_SLUG,
    displayName: "Order",
    category: undefined,
    layoutUrl: `/dms/pages/${ORDER_SLUG}/pagelayout`,
  };
}

function block(path: string, component: string): RenderedBlock {
  return { path, component, present: true, visible: true };
}

function servedLayout(layout: JsonValue): Parameters<typeof readLayout>[0] {
  const answered = {
    ok: () => true,
    status: () => 200,
    json: async () => layout,
    text: async () => JSON.stringify(layout),
  };
  return { request: { get: async () => answered, post: async () => answered } };
}

function emptyReport(): Omit<PageReport, "ok" | "failures"> {
  return {
    page: "/sales",
    render: { viewports: [] },
    data: [],
    errors: { console: [], failedRequests: [] },
    interactions: [],
    permissions: [],
  };
}

function unused(): never {
  throw new Error(
    "the mockup viewer check called an unexpected browser method",
  );
}

/** A context whose one page records the URLs it opens, each answered 404 as a dashboard without the viewer. */
function recordingContext(opened: string[]): BrowserContext {
  const request = { method: () => "GET", url: () => "", failure: () => null };
  const locator: Locator = {
    first: () => locator,
    last: () => locator,
    nth: () => locator,
    locator: () => locator,
    count: unused,
    click: unused,
    fill: unused,
    inputValue: unused,
    getAttribute: unused,
    innerText: unused,
    isVisible: unused,
    isEnabled: unused,
    screenshot: unused,
    evaluateAll: unused,
    page: unused,
  };
  const page: Page = {
    goto: async (url) => {
      opened.push(url);
      return { status: () => 404, url: () => url, request: () => request };
    },
    waitForFunction: unused,
    waitForTimeout: async () => undefined,
    locator: () => locator,
    evaluate: unused,
    url: () => opened.at(-1) ?? "about:blank",
    setViewportSize: async () => undefined,
    frames: () => [],
    context: unused,
    getByRole: () => locator,
    keyboard: { press: unused },
    close: async () => undefined,
    on: () => undefined,
    off: () => undefined,
  };
  return {
    request: { get: unused, post: unused },
    newPage: async () => page,
    route: unused,
  };
}

function findsPages(): void {
  it("is served in Safe mode, since it only reads", () => {
    const tool = MCP_TOOLS.find(
      (candidate) => candidate.name === "page_verify",
    );
    expect(tool?.effect).to.equal("read");
    expect(tool !== undefined && isToolAllowed(tool, "safe")).to.equal(true);
  });

  it("opens a page with parameters at the route asked, its layout endpoint filled the same way", () => {
    pagesBySlug[ORDER_SLUG] = orderPage();
    const target = resolvePage("/sales/orders/42?tab=lines");
    expect(target?.route).to.equal("/sales/orders/42");
    expect(target?.layoutPath).to.equal(
      "/dms/pages/sales/orders/42/pagelayout",
    );
  });

  it("finds a page by its full id, and none for a route no page serves", () => {
    pagesBySlug[ORDER_SLUG] = orderPage();
    expect(resolvePage("sales.order")?.info.fullSlug).to.equal(ORDER_SLUG);
    expect(resolvePage("/sales/invoices/42")).to.equal(undefined);
  });
}

function readsPageBlocks(): void {
  it("reads a preview notice as the block's data state, and an unknown state as an error", () => {
    const probe: PageProbe = {
      blocks: [
        {
          path: "orders",
          componentName: "",
          issue: "needs_backend",
          rect: null,
        },
        { path: "total", componentName: "dms-kpi-card", rect: null },
      ],
      viewportWidth: 1440,
      documentWidth: 1440,
      dataBlocks: [{ path: "total", type: "KpiCard", state: "stale" }],
    };
    expect(
      readDataBlocks(probe, "desktop").map((entry) => [
        entry.path,
        entry.state,
      ]),
    ).to.deep.equal([
      ["total", "error"],
      ["orders", "needs_backend"],
    ]);
  });

  it("pairs a mockup block with the page block of its path first, then with the next one drawing the same component", () => {
    const mockup = [
      { path: "kpis.revenue", componentName: "dms-kpi-card", rect: null },
      { path: "block-0", componentName: "dms-kpi-card", rect: null },
      { path: "block-1", componentName: "dms-table-view", rect: null },
    ];
    const page = [
      block("kpis.orders", "dms-kpi-card"),
      block("kpis.revenue", "dms-kpi-card"),
      block("chart", "dms-chart-card"),
    ];
    const paired = pairBlocks(mockup, page);
    expect(paired.get("kpis.revenue")?.path).to.equal("kpis.revenue");
    expect(paired.get("block-0")?.path).to.equal("kpis.orders");
    expect(paired.has("block-1")).to.equal(false);
  });

  it("opens the mockup viewer on the mockup's fixtures, never on the live routes of a converted page", async () => {
    const opened: string[] = [];
    const comparison = await compareWithMockup(
      recordingContext(opened),
      "http://localhost:3001",
      { name: "orders-desk", page: "orders" },
      [],
      {
        store: { projectPath: "/project", dir: "/project/run" },
        viewport: { name: "desktop", width: 1440, height: 900 },
      },
    );
    expect(opened).to.have.length(1);
    const viewer = new URL(opened[0]);
    expect(viewer.pathname).to.equal("/mockup");
    expect(viewer.searchParams.get("name")).to.equal("orders-desk");
    expect(viewer.searchParams.get("data")).to.equal("sample");
    expect(comparison.unavailable).to.match(/serves no \/mockup viewer/);
  });

  it("reads a layout whose block options are null or name no string fetchUrl", async () => {
    const layout = {
      components: {
        banner: { componentName: "dms-banner-block", options: null },
        chart: { componentName: "dms-chart-card", options: { fetchUrl: 42 } },
        kpi: {
          componentName: "dms-kpi-card",
          options: { fetchUrl: "/api/kpi" },
        },
      },
    };
    const answer = await readLayout(
      servedLayout(layout),
      "/dms/pages/x/pagelayout",
    );
    expect(answer).to.deep.equal({
      status: "served",
      blocks: [
        { path: "banner", component: "dms-banner-block" },
        { path: "chart", component: "dms-chart-card" },
        { path: "kpi", component: "dms-kpi-card", source: "/api/kpi" },
      ],
    });
  });
}

function namesSourcesAndJudgesOpeners(): void {
  it("names the URL each table view lists from: its source's, else its controller's list route", async () => {
    const layout = {
      components: {
        orders: {
          componentName: "dms-table-view",
          options: { location: "/api/orders" },
        },
        feed: {
          componentName: "dms-table-view",
          options: {
            location: "/api/feed",
            source: { fetchUrl: "/api/feed?mine=1" },
          },
        },
      },
    };
    const answer = await readLayout(
      servedLayout(layout),
      "/dms/pages/x/pagelayout",
    );
    expect(answer).to.deep.equal({
      status: "served",
      blocks: [
        {
          path: "orders",
          component: "dms-table-view",
          source: "/api/orders/list",
        },
        {
          path: "feed",
          component: "dms-table-view",
          source: "/api/feed?mine=1",
        },
      ],
    });
  });

  it("reads an opener that opened a dropdown menu as acting, and one with no effect as broken", () => {
    const guard = { submit: false, writes: [] };
    const menu = withoutEditor(
      {
        wrote: false,
        menu: ["Blank order", "From template"],
        changedPage: false,
      },
      guard,
    );
    expect(menu).to.deep.equal({
      ok: true,
      detail:
        'not checked: the click opened a menu of "Blank order", "From template"',
    });
    expect(
      withoutEditor({ wrote: false, changedPage: false }, guard).ok,
    ).to.equal(false);
  });
}

function checksRolesAndListsFailures(): void {
  it("checks a role only through a member holding that role alone, never through an owner or a member with more roles", () => {
    const member = (
      userId: string,
      roleIds: string[],
      isTenantOwner = false,
    ): MemberRoles => ({ userId, roleIds, isTenantOwner });
    const members = [
      member("both", ["nobody", "viewer"]),
      member("owner", ["viewer"], true),
      member("platform", ["viewer"]),
      member("viewer-only", ["viewer"]),
    ];
    const owners = new Set(["platform"]);
    expect(pickMember(members, "nobody", owners)).to.equal(undefined);
    expect(pickMember(members, "viewer", owners)?.userId).to.equal(
      "viewer-only",
    );
  });

  it("lists one line per failed check and none for the checks that passed", () => {
    const report = emptyReport();
    report.render.viewports.push({
      viewport: "mobile",
      width: 390,
      height: 844,
      blocks: [
        block("total", "dms-kpi-card"),
        { ...block("chart", "dms-chart-card"), present: false },
        {
          ...block("status", "dms-banner-block"),
          visible: false,
          drewNothing: true,
        },
        { ...block("wide", "dms-grid-block"), visible: false },
      ],
      layout: {
        horizontalOverflow: true,
        overflowingBlocks: [],
        overlappingBlocks: [],
      },
    });
    report.data.push(
      { path: "total", type: "KpiCard", state: "ok", viewport: "mobile" },
      {
        path: "orders",
        type: "TableView",
        state: "empty",
        viewport: "mobile",
        source: "/api/orders",
      },
      {
        path: "orders.chart",
        type: "Chart",
        state: "empty",
        viewport: "mobile",
      },
    );
    report.interactions.push(
      {
        kind: "tab",
        target: 'tab "Lines"',
        ok: true,
        detail: "selected on click",
      },
      {
        kind: "form",
        target: 'form "New order"',
        ok: false,
        detail: "no form opened on click",
      },
    );
    report.permissions.push(
      { role: "Sales", expected: "allowed", observed: "rendered", ok: true },
      { role: "Support", expected: "refused", observed: "rendered", ok: false },
    );
    expect(listFailures(report)).to.deep.equal([
      "mobile: block chart (dms-chart-card) is missing",
      "mobile: block wide (dms-grid-block) reaches outside the page width",
      "mobile: the page scrolls sideways",
      "data: TableView at orders is empty (reads /api/orders)",
      'form: form "New order": no form opened on click',
      "permissions: role Support should be refused but the page rendered",
    ]);
  });
}

describe("[unit] mcp page_verify", () => {
  afterEach(() => {
    delete pagesBySlug[ORDER_SLUG];
  });

  findsPages();
  readsPageBlocks();
  namesSourcesAndJudgesOpeners();
  checksRolesAndListsFailures();
});
