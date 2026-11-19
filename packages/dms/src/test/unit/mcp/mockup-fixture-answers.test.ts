import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import {
  answer,
  mockupTool,
  NAME,
  useWorkspace,
  writeAnswerSchema,
} from "../../helpers/mockup-mcp";

const write = mockupTool("mockup_write_spec");
const patch = mockupTool("mockup_patch_spec");

const workspace = useWorkspace();

const SERIES = "[{ name, data: [{ x, y }] }] or [{ x, y }]";

function chartCard(key: string): JsonValue {
  return {
    id: "orders-channel",
    type: "ChartCard",
    options: { title: "Orders by channel", fetchUrl: `fixture:${key}` },
    children: [{ id: "chart", type: "ChartDonut" }],
  };
}

function topList(key: string): JsonValue {
  return {
    type: "TopListCard",
    options: { title: "Tickets by assignee", fetchUrl: `fixture:${key}` },
  };
}

function page(fixtures: JsonValue, ...tree: JsonValue[]): JsonValue {
  return {
    version: 1,
    pages: [{ id: "home", title: "Home", fixtures, tree }],
  };
}

function written(spec: JsonValue) {
  return answer(write, { mockup: NAME, spec }, writeAnswerSchema);
}

describe("[unit] mockup fixture answers", () => {
  it("writes a ChartCard fixture of points without x and y, and warns at the fixture with what the card reads", async () => {
    const spec = page(
      {
        "orders-channel": {
          value: 12,
          series: [{ label: "Web", value: 9 }],
        },
      },
      chartCard("orders-channel"),
    );

    const result = await written(spec);

    expect(result.ok).to.equal(true);
    expect(result.errors).to.deep.equal([]);
    expect(result.warnings).to.deep.equal([
      {
        path: "/pages/0/fixtures/orders-channel",
        message: `fixture "orders-channel" read by ChartCard at /pages/0/tree/0: series must be ${SERIES}, got [{"label":"Web","value":9}]`,
      },
    ]);
    expect(JSON.parse(await workspace.specBytes())).to.deep.equal(spec);
  });

  it("reads a ChartCard fixture of one point per group without a warning", async () => {
    const result = await written(
      page(
        {
          "orders-channel": {
            value: 12,
            series: [
              { x: "Web", y: 9 },
              { x: "Mobile", y: 3 },
            ],
          },
        },
        chartCard("orders-channel"),
      ),
    );

    expect(result).to.deep.equal({ ok: true, errors: [], warnings: [] });
  });

  it("warns of a TopListCard fixture written as the bare array of its items", async () => {
    const result = await written(
      page(
        { tickets: [{ id: "a1", title: "Maya", value: 31 }] },
        topList("tickets"),
      ),
    );

    expect(result.ok).to.equal(true);
    expect(result.warnings.map(({ path }) => path)).to.deep.equal([
      "/pages/0/fixtures/tickets",
    ]);
    expect(result.warnings[0].message).to.match(
      /^fixture "tickets" read by TopListCard at \/pages\/0\/tree\/0: must be an object \{ items \}, got \[\{"id":"a1"/,
    );
  });

  it("names the item field a list block's fixture lacks, as the block's own items option checks it", async () => {
    const result = await written(
      page(
        { stats: { items: [{ value: 8 }] } },
        { type: "StatGroup", options: { fetchUrl: "fixture:stats" } },
      ),
    );

    expect(result.warnings).to.have.length(1);
    expect(result.warnings[0].message).to.equal(
      'fixture "stats" read by StatGroup at /pages/0/tree/0: items must be [{ id?, icon?, tone?, eyebrow, value, detail?, detailTone?, to? }] (items/0/eyebrow is missing)',
    );
  });

  it("warns of a key the block does not read", async () => {
    const result = await written(
      page(
        { revenue: { value: 10, trend: [1, 2] } },
        {
          type: "KpiCard",
          options: { title: "Revenue", fetchUrl: "fixture:revenue" },
        },
      ),
    );

    expect(result.ok).to.equal(true);
    expect(result.warnings.map(({ message }) => message)).to.deep.equal([
      'fixture "revenue" read by KpiCard at /pages/0/tree/0: the block reads no "trend": it reads { value, delta?, previousValue?, sparkline?, caption? }',
    ]);
  });
});

describe("[unit] mockup fixture answers of a missing key, a patch and a clean spec", () => {
  it("refuses a block reading a fixture key the page lacks, writing nothing", async () => {
    const result = await written(page({}, topList("nowhere")));

    expect(result).to.deep.equal({
      ok: false,
      errors: [
        {
          path: "/pages/0/tree/0/options/fetchUrl",
          message: 'the page has no fixture named "nowhere"',
        },
      ],
      warnings: [],
    });
  });

  it("reports the warning of a block a patch adds, with its fixture, in the patch's answer", async () => {
    await written(page({}));

    const result = await answer(
      patch,
      {
        mockup: NAME,
        patch: [
          {
            op: "add",
            path: "/pages/0/fixtures/channels",
            value: { series: [{ x: "Web" }] },
          },
          {
            op: "add",
            path: "/pages/0/tree/-",
            value: {
              type: "ChartBar",
              options: { fetchUrl: "fixture:channels" },
            },
          },
        ],
      },
      writeAnswerSchema,
    );

    expect(result.ok).to.equal(true);
    expect(result.warnings).to.deep.equal([
      {
        path: "/pages/0/fixtures/channels",
        message: `fixture "channels" read by ChartBar at /pages/0/tree/0: series must be ${SERIES}, got [{"x":"Web"}]`,
      },
    ]);
  });

  it("writes a spec whose every fixture is what its block reads without a warning", async () => {
    const result = await written(
      page(
        {
          revenue: {
            value: 184320,
            delta: 8.6,
            previousValue: 169720,
            sparkline: [12100, 13400],
          },
          weekly: {
            value: 184320,
            series: [{ name: "Revenue", data: [{ x: "Aug 24", y: 12100 }] }],
          },
          countries: { series: [{ x: "US", y: 599 }] },
          tickets: { items: [{ id: "a1", title: "Maya", value: 31 }] },
          stats: { items: [{ eyebrow: "Members", value: 8 }] },
          quota: { value: 40, max: 100 },
        },
        { id: "period", type: "PeriodSelector" },
        {
          type: "KpiCard",
          options: { title: "Revenue", fetchUrl: "fixture:revenue" },
        },
        chartCard("weekly"),
        { type: "ChartBar", options: { fetchUrl: "fixture:countries" } },
        topList("tickets"),
        { type: "StatGroup", options: { fetchUrl: "fixture:stats" } },
        { type: "Meter", options: { fetchUrl: "fixture:quota" } },
      ),
    );

    expect(result).to.deep.equal({ ok: true, errors: [], warnings: [] });
  });
});

describe("[unit] mockup fixture answers: a change figure on a page without a period", () => {
  const revenue = {
    type: "KpiCard",
    options: { title: "Revenue", fetchUrl: "fixture:revenue" },
  };

  it("warns of a KpiCard delta: the built page shows no change without a PeriodSelector", async () => {
    const result = await written(
      page({ revenue: { value: 184320, delta: 8.6 } }, revenue),
    );

    expect(result.ok).to.equal(true);
    expect(result.warnings).to.deep.equal([
      {
        path: "/pages/0/fixtures/revenue",
        message:
          'fixture "revenue" read by KpiCard at /pages/0/tree/0: delta needs a PeriodSelector on the page; the built page shows no change figure without one',
      },
    ]);
  });

  it("warns of a ChartCard's delta and previousValue together", async () => {
    const result = await written(
      page(
        {
          weekly: {
            value: 12,
            delta: 4.2,
            previousValue: 11,
            series: [{ x: "Web", y: 9 }],
          },
        },
        chartCard("weekly"),
      ),
    );

    expect(result.warnings).to.deep.equal([
      {
        path: "/pages/0/fixtures/weekly",
        message:
          'fixture "weekly" read by ChartCard at /pages/0/tree/0: delta and previousValue need a PeriodSelector on the page; the built page shows no change figure without one',
      },
    ]);
  });

  it("reads a delta without a warning on a page whose toolbar holds a PeriodSelector", async () => {
    const result = await written(
      page(
        { revenue: { value: 184320, delta: 8.6, previousValue: 169720 } },
        {
          id: "toolbar",
          type: "PageToolbar",
          children: [{ id: "period", type: "PeriodSelector" }],
        },
        revenue,
      ),
    );

    expect(result).to.deep.equal({ ok: true, errors: [], warnings: [] });
  });

  it("judges the page reading the fixture, not the page holding it", async () => {
    const result = await written({
      version: 1,
      pages: [
        {
          id: "home",
          title: "Home",
          fixtures: { revenue: { value: 184320, delta: 8.6 } },
          tree: [{ id: "period", type: "PeriodSelector" }, revenue],
        },
        {
          id: "detail",
          title: "Detail",
          parent: "home",
          tree: [revenue],
        },
      ],
    });

    expect(result.warnings.map(({ message }) => message)).to.deep.equal([
      'fixture "revenue" read by KpiCard at /pages/1/tree/0: delta needs a PeriodSelector on the page; the built page shows no change figure without one',
    ]);
  });
});
