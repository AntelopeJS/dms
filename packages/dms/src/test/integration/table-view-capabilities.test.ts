import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { countRawDocuments, resetDatabase } from "../helpers/db";

// The table view capabilities the server takes part in, over the test host's
// invoices (src/test/attachment-host/capabilities.ts): footer summaries,
// filter tokens resolved per caller, and a bulk route finding its rows.

const LOCATION = "/api/capabilities/invoices";
const COLLECTION = "capability-invoices";
const SLUG = "/capability-invoices";
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;

interface Invoice {
  _id: string;
  number: string;
  status: string;
}

interface FooterSummary {
  id: string;
  label: string;
}

async function seed(client: AxiosInstance, ownerId: string): Promise<void> {
  const rows = [
    { number: "INV-1", status: "open", amount: 100, ownerId },
    { number: "INV-2", status: "open", amount: 250, ownerId },
    { number: "INV-3", status: "open", amount: 50 },
    { number: "INV-4", status: "paid", amount: 500 },
    { number: "INV-5", status: "paid", amount: 75 },
  ];
  for (const row of rows) {
    const created = await client.post(`${LOCATION}/new`, row);
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
  }
}

async function list(client: AxiosInstance, query = ""): Promise<Invoice[]> {
  const response = await client.get(`${LOCATION}/list?limit=50${query}`);
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  return response.data.results as Invoice[];
}

describe("[integration] table view capabilities", () => {
  let client: AxiosInstance;
  let userId: string;
  let summaryIds: string[];

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    userId = owner.userId;
    client = authorizedClient(owner.accessToken);
    await seed(client, userId);
    const layout = await client.get("/dms/pagelayout", {
      params: { slug: SLUG },
    });
    expect(layout.status, JSON.stringify(layout.data)).to.equal(HTTP_OK);
    const options = layout.data.components.content.options;
    expect(options.tableId).to.equal("content");
    expect(options.isSoleTableView).to.equal(true);
    expect(options.footer.legend).to.equal("status");
    const summaries = options.footer.summary as FooterSummary[];
    expect(summaries.map((summary) => summary.label)).to.deep.equal([
      "Total",
      "Open",
      "Open or large",
    ]);
    expect(JSON.stringify(summaries)).not.to.contain("where");
    summaryIds = summaries.map((summary) => summary.id);
  });

  const summaryQuery = (filters = "") =>
    `${LOCATION}/summary?${summaryIds.map((id) => `ids=${id}`).join("&")}${filters}`;

  it("computes the footer summaries over every row the filters list", async () => {
    const all = await client.get(summaryQuery());
    expect(all.status, JSON.stringify(all.data)).to.equal(HTTP_OK);
    const [total, open, openOrLarge] = summaryIds;
    expect(all.data).to.deep.equal({
      [total!]: 975,
      [open!]: 3,
      [openOrLarge!]: 900,
    });

    const paid = await client.get(summaryQuery("&filter_status=is:paid"));
    expect(paid.data).to.deep.equal({
      [total!]: 575,
      [open!]: 0,
      [openOrLarge!]: 500,
    });
  });

  it("stores the dates an edit sends as text as dates, and keeps what it leaves out", async () => {
    const [invoice] = await list(client, "&filter_number=is:INV-3");
    const edit = async (body: Record<string, unknown>) => {
      const response = await client.put(`${LOCATION}/edit`, body, {
        params: { id: invoice!._id },
      });
      expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    };

    await edit({
      dueAt: "2026-03-31",
      period: { start: "2026-03-01", end: "2026-03-31" },
      ownerId: "accounting",
    });
    await edit({ ownerId: null });

    expect(
      await countRawDocuments(COLLECTION, {
        number: "INV-3",
        status: "open",
        amount: 50,
        ownerId: null,
        dueAt: new Date("2026-03-31"),
        period: { start: new Date("2026-03-01"), end: new Date("2026-03-31") },
      }),
    ).to.equal(1);
  });

  it("refuses an edit clearing a mandatory field, naming it, and keeps the row", async () => {
    const [invoice] = await list(client, "&filter_number=is:INV-4");
    for (const cleared of [null, ""]) {
      const response = await client.put(
        `${LOCATION}/edit`,
        { number: cleared, status: "open" },
        { params: { id: invoice!._id } },
      );
      expect(response.status).to.equal(HTTP_BAD_REQUEST);
      expect(JSON.stringify(response.data)).to.contain(
        "Missing mandatory fields: number",
      );
    }
    expect(
      await countRawDocuments(COLLECTION, { number: "INV-4", status: "paid" }),
    ).to.equal(1);
  });

  it("refuses a summary no table view declared", async () => {
    const response = await client.get(`${LOCATION}/summary?ids=999`);
    expect(response.status).to.equal(HTTP_BAD_REQUEST);
  });

  it("resolves {{user.id}} to the caller in lists and counters", async () => {
    const mine = await list(client, "&filter_ownerId=is:{{user.id}}");
    expect(mine.map((row) => row.number).sort()).to.deep.equal([
      "INV-1",
      "INV-2",
    ]);
    const counts = await client.post(`${LOCATION}/count/batch`, {
      queries: [{ id: "mine", query: { filter_ownerId: "is:{{user.id}}" } }],
    });
    expect(counts.data).to.deep.equal({ mine: 2 });

    const other = await registerUser({ owner: true });
    const otherCounts = await authorizedClient(other.accessToken).post(
      `${LOCATION}/count/batch`,
      {
        queries: [{ id: "mine", query: { filter_ownerId: "is:{{user.id}}" } }],
      },
    );
    expect(otherCounts.data).to.deep.equal({ mine: 0 });
  });

  it("hands a bulk route the selected ids, or every row the filters match", async () => {
    const open = await list(client, "&filter_status=is:open");
    const [first] = open;
    const selected = await client.post(
      `${LOCATION}/mark-paid?ids=${first!._id}`,
    );
    expect(selected.data.ids).to.deep.equal([first!._id]);

    const matching = await client.post(
      `${LOCATION}/mark-paid?allMatching=true&filter_status=is:open&search=INV`,
    );
    expect(matching.status, JSON.stringify(matching.data)).to.equal(HTTP_OK);
    expect(matching.data.ids).to.have.length(2);
    expect(await list(client, "&filter_status=is:open")).to.deep.equal([]);
  });

  it("refuses the selected ids to a caller who may not list the rows", async () => {
    const [invoice] = await list(client);
    const member = await registerUser();
    const memberClient = authorizedClient(member.accessToken);
    const listed = await memberClient.get(`${LOCATION}/list`);
    expect(listed.status).to.equal(HTTP_FORBIDDEN);

    const selected = await memberClient.post(
      `${LOCATION}/mark-paid?ids=${invoice!._id}`,
    );
    expect(selected.status, JSON.stringify(selected.data)).to.equal(
      HTTP_FORBIDDEN,
    );
  });
});
