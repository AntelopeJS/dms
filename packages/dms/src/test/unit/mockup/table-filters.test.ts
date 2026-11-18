import { expect } from "chai";
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { compileSpec, mockupNameSchema, parseSpec } from "../../../mockup";
import {
  MOCKUP_API as BASE,
  serveMockupRoutes,
} from "../../helpers/mockup-routes";

const ORDERS = [
  {
    _id: "o1",
    customer: "Acme",
    total: 120,
    status: "paid",
    placedAt: "2026-01-11T09:12:00.000Z",
    tags: ["vip", "eu"],
  },
  {
    _id: "o2",
    customer: "Brightline",
    total: 480,
    status: "pending",
    placedAt: "2026-01-10T08:40:00.000Z",
    tags: ["eu"],
  },
  {
    _id: "o3",
    customer: "Corvid",
    total: 75,
    status: "paid",
    placedAt: "2026-01-09T17:05:00.000Z",
    tags: [],
  },
  {
    _id: "o4",
    customer: "Delta Acme",
    total: 310,
    status: "refunded",
    placedAt: "2026-01-08T11:30:00.000Z",
  },
  {
    _id: "o5",
    customer: "Evergreen",
    total: 220,
    status: "paid",
    placedAt: "2026-01-07T15:48:00.000Z",
    tags: ["vip"],
  },
];

const TABLE = {
  type: "TableView",
  options: {
    caption: "Orders",
    fetchUrl: "fixture:orders",
    rowIdKey: "_id",
    tabs: [
      { id: "all", label: "All" },
      {
        id: "paid",
        label: "Paid",
        filter: { accessorKey: "status", mode: "is", value: "paid" },
      },
    ],
    quickFilters: [{ field: "status" }],
    columns: {
      customer: { type: "string", sortable: true },
      total: { type: "number", sortable: true },
      status: { type: "string", filterable: true },
    },
  },
};

const SPEC = JSON.stringify({
  version: 1,
  pages: [
    {
      id: "home",
      title: "Home",
      fixtures: { orders: ORDERS },
      tree: [TABLE],
    },
  ],
});

const rowsSchema = z.object({
  results: z.array(z.object({ _id: z.string() })),
  total: z.number(),
});

const capabilitiesSchema = z.object({
  source: z.object({
    capabilities: z.object({
      search: z.boolean(),
      sort: z.boolean(),
      paginate: z.boolean(),
      filter: z.boolean(),
    }),
  }),
});

function compile(text: string) {
  const read = parseSpec(text);
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(mockupNameSchema.parse("demo"), read.spec);
}

describe("[unit] mockup tables: filters", () => {
  const served = serveMockupRoutes(SPEC);
  let owner: AxiosInstance;

  before(() => {
    ({ owner } = served());
  });

  async function idsOf(query: string): Promise<string[]> {
    const response = await owner.get(
      `${BASE}/desk/pages/home/fixtures/orders/rows?${query}`,
    );
    return rowsSchema.parse(response.data).results.map((row) => row._id);
  }

  it("compiles a table with tabs and quick filters with no issue, the route applying the filters", () => {
    const compiled = compile(SPEC);

    expect(compiled.issues).to.deep.equal([]);
    expect(
      capabilitiesSchema.parse(compiled.pages[0].tree[0].options).source
        .capabilities,
    ).to.deep.equal({ search: true, sort: true, paginate: true, filter: true });
  });

  it("narrows the rows to a tab's filter and counts the match", async () => {
    const response = await owner.get(
      `${BASE}/desk/pages/home/fixtures/orders/rows?filter_status=is:paid&limit=2`,
    );
    const page = rowsSchema.parse(response.data);

    expect(page.results.map((row) => row._id)).to.deep.equal(["o1", "o3"]);
    expect(page.total).to.equal(3);
  });

  it("keeps the rows passing every filter repeated on one field", async () => {
    expect(
      await idsOf(
        "filter_total=greater_than:100&filter_total=less_than_or_equal_to:310",
      ),
    ).to.deep.equal(["o1", "o4", "o5"]);
    expect(
      await idsOf("filter_status=is:paid&filter_status=is_not:paid"),
    ).to.deep.equal([]);
  });

  it("reads a quick filter's list of values as any of them", async () => {
    expect(await idsOf("filter_status=is:pending,refunded")).to.deep.equal([
      "o2",
      "o4",
    ]);
    expect(await idsOf("filter_status=is_not:paid")).to.deep.equal([
      "o2",
      "o4",
    ]);
  });

  it("filters text, dates, emptiness and lists", async () => {
    expect(await idsOf("filter_customer=contains:ACME")).to.deep.equal([
      "o1",
      "o4",
    ]);
    expect(await idsOf("filter_customer=not_contains:acme")).to.deep.equal([
      "o2",
      "o3",
      "o5",
    ]);
    expect(
      await idsOf("filter_placedAt=is_between:2026-01-08,2026-01-10T23:59:59Z"),
    ).to.deep.equal(["o2", "o3", "o4"]);
    expect(await idsOf("filter_tags=is_empty:")).to.deep.equal(["o3", "o4"]);
    expect(await idsOf("filter_tags=is_not_empty")).to.deep.equal([
      "o1",
      "o2",
      "o5",
    ]);
    expect(await idsOf("filter_tags=include:vip")).to.deep.equal(["o1", "o5"]);
    expect(await idsOf("filter_tags=exclude:vip")).to.deep.equal([
      "o2",
      "o3",
      "o4",
    ]);
  });

  it("combines filters with search, sort and paging, and ignores a mode it does not know", async () => {
    expect(
      await idsOf(
        "filter_status=is:paid&search=e&sortKey=total&sortDirection=desc",
      ),
    ).to.deep.equal(["o5", "o1"]);
    expect(await idsOf("filter_status=bogus:paid")).to.have.length(5);
    expect(await idsOf("filter_=is:paid")).to.have.length(5);
  });
});
