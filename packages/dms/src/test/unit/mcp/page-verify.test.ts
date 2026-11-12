import type { PageInfo } from "@antelopejs/interface-dms/page";
import { expect } from "chai";
import { isToolAllowed } from "../../../mcp/access";
import {
  listFailures,
  type MemberRoles,
  pickMember,
  type PageProbe,
  type PageReport,
  pairBlocks,
  readDataBlocks,
  type RenderedBlock,
  resolvePage,
} from "../../../mcp/page-verify";
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

describe("[unit] mcp page_verify", () => {
  afterEach(() => {
    delete pagesBySlug[ORDER_SLUG];
  });

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
      screenshot: "page.png",
      blocks: [
        block("total", "dms-kpi-card"),
        { ...block("chart", "dms-chart-card"), present: false },
        {
          ...block("status", "dms-banner-block"),
          visible: false,
          drewNothing: true,
        },
        { ...block("wide", "dms-grid"), visible: false },
      ],
      layout: {
        horizontalOverflow: true,
        overflowingBlocks: [],
        overlappingBlocks: [],
      },
    });
    report.data.push(
      { path: "total", type: "KpiCard", state: "ok", viewport: "mobile" },
      { path: "orders", type: "TableView", state: "empty", viewport: "mobile" },
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
      "mobile: block wide (dms-grid) reaches outside the page width",
      "mobile: the page scrolls sideways",
      "data: TableView at orders is empty",
      'form: form "New order": no form opened on click',
      "permissions: role Support should be refused but the page rendered",
    ]);
  });
});
