import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// One export end to end over the test host's deals
// (src/test/attachment-host/export.ts): the job is started, polled and
// downloaded as the table's export button does, and the file is read back.

const CUSTOMERS = "/api/export/customers";
const DEALS = "/api/export/deals";
const RAW_DEALS = "/api/export/raw-deals";
const HTTP_OK = 200;
const POLL_INTERVAL_MS = 50;
const MAX_POLLS = 100;
const BOM = "﻿";
// Intl separates a figure from its sign with a (narrow) no-break space.
const ANY_SPACE = /\s/g;

interface ListedRow {
  _id: string;
  title?: string;
}

interface ExportTicket {
  jobId: string;
}

interface ExportStatusResponse {
  status: string;
  error?: string;
}

/** A CSV file as rows of cells, quotes unwrapped. */
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let isQuoted = false;
  const text = content.startsWith(BOM) ? content.slice(BOM.length) : content;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (isQuoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        isQuoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      isQuoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) rows.push([...row, cell]);
  return rows.map((cells) =>
    cells.map((value) => value.replace(ANY_SPACE, " ")),
  );
}

describe("[integration] table view export — readable values", () => {
  let client: AxiosInstance;
  let shedId: string;
  let customerId: string;

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);

    await create(CUSTOMERS, { name: "Acme" });
    customerId = (await list(CUSTOMERS))[0]!._id;
    await create(DEALS, {
      title: "Roof",
      customer: customerId,
      stage: "visit",
      expectedClose: "2027-01-09T00:00:00.000Z",
      lastContact: "2026-10-01T14:05:00.000Z",
      probability: 0.45,
      amount: 1250.5,
      isWon: false,
    });
    await create(DEALS, {
      title: "Shed",
      customer: customerId,
      stage: "lost",
      expectedClose: "2027-03-02T00:00:00.000Z",
      lastContact: "2026-09-15T08:30:00.000Z",
      probability: 1,
      amount: 300,
      isWon: true,
    });
    const deals = await list(DEALS);
    shedId = deals.find((deal) => deal.title === "Shed")!._id;
  });

  async function create(location: string, row: Record<string, unknown>) {
    const created = await client.post(`${location}/new`, row);
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
  }

  async function list(location: string): Promise<ListedRow[]> {
    const response = await client.get(`${location}/list?limit=50`);
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response.data.results as ListedRow[];
  }

  async function waitForJob(location: string, jobId: string): Promise<void> {
    for (let poll = 0; poll < MAX_POLLS; poll += 1) {
      const response = await client.get<ExportStatusResponse>(
        `${location}/export/status/${jobId}`,
      );
      expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
      if (response.data.status === "completed") return;
      expect(response.data.status, response.data.error).to.equal("pending");
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(`Export ${jobId} did not complete`);
  }

  async function exportRows(
    location: string,
    language: string,
    query: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ): Promise<string[][]> {
    const started = await client.get<ExportTicket>(`${location}/export/start`, {
      params: {
        delivery: "download",
        sortKey: "title",
        sortDirection: "asc",
        ...query,
      },
      // `ids=a&ids=b`, as the export button sends a selection.
      paramsSerializer: { indexes: null },
      headers: { "x-content-language": language, ...headers },
    });
    expect(started.status, JSON.stringify(started.data)).to.equal(HTTP_OK);
    await waitForJob(location, started.data.jobId);
    const file = await client.get<string>(
      `${location}/export/download/${started.data.jobId}`,
      { responseType: "text" },
    );
    expect(file.status).to.equal(HTTP_OK);
    return parseCsv(file.data);
  }

  it("writes the columns' names and worded values in the caller's language", async () => {
    const [header, roof, shed] = await exportRows(DEALS, "fr");

    expect(header).to.deep.equal([
      "Nom",
      "Customer",
      "Stage",
      "Expected close",
      "Last contact",
      "Probability",
      "Amount (EUR)",
      "Won",
    ]);
    expect(roof).to.deep.equal([
      "Roof",
      "Acme",
      "En ligne",
      "09/01/2027",
      "01/10/2026 14:05",
      "45 %",
      "1250.5",
      "Non",
    ]);
    expect(shed).to.include.members(["Shed", "Hors ligne", "100 %", "Oui"]);
  });

  it("writes English for an English interface", async () => {
    const [header, roof] = await exportRows(DEALS, "en");

    expect(header[0]).to.equal("Name");
    expect(roof).to.deep.equal([
      "Roof",
      "Acme",
      "Online",
      "09/01/2027",
      "01/10/2026, 14:05",
      "45%",
      "1250.5",
      "No",
    ]);
  });

  it("writes times in the zone the browser names, UTC without one", async () => {
    const [, brussels] = await exportRows(
      DEALS,
      "en",
      {},
      { "x-time-zone": "Europe/Brussels" },
    );
    const [, unknown] = await exportRows(
      DEALS,
      "en",
      {},
      { "x-time-zone": "Mars/Olympus" },
    );

    expect(brussels[4]).to.equal("01/10/2026, 16:05");
    expect(unknown[4]).to.equal("01/10/2026, 14:05");
  });

  it("keeps the selection: only the rows the caller ticked", async () => {
    const rows = await exportRows(DEALS, "en", { ids: [shedId] });

    expect(rows.slice(1).map((row) => row[0])).to.deep.equal(["Shed"]);
  });

  it("writes the stored values under the field keys for a raw table", async () => {
    const [header, roof] = await exportRows(RAW_DEALS, "fr");

    expect(header).to.deep.equal([
      "title",
      "customer",
      "stage",
      "expectedClose",
      "lastContact",
      "probability",
      "amount",
      "isWon",
    ]);
    expect(roof).to.deep.equal([
      "Roof",
      customerId,
      "visit",
      "2027-01-09T00:00:00.000Z",
      "2026-10-01T14:05:00.000Z",
      "0.45",
      "1250.5",
      // The CSV writer's own cast, unchanged: `false` is an empty cell.
      "",
    ]);
  });
});
