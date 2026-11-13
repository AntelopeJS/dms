import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { parseBody } from "../helpers/parse-body";

const LOCATION = "/api/capabilities/invoices";
const OTHER_LOCATION = "/api/capabilities/open-invoices";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const POLL_ATTEMPTS = 50;
const POLL_INTERVAL_MS = 100;

const StartBody = z.object({ jobId: z.string() });

const StatusBody = z.object({ status: z.string() });

let client: AxiosInstance;

async function settledStatus(jobId: string): Promise<string> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const response = await client.get(`${LOCATION}/export/status/${jobId}`);
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    const { status } = parseBody(StatusBody, response);
    if (status !== "pending") return status;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return "pending";
}

describe("[integration] table view export access", () => {
  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
  });

  it("answers an export's status on the table view that started it, and refuses it on another", async () => {
    const started = await client.get(`${LOCATION}/export/start`, {
      params: { format: "csv" },
    });
    expect(started.status, JSON.stringify(started.data)).to.equal(HTTP_OK);
    const { jobId } = parseBody(StartBody, started);

    expect(await settledStatus(jobId)).to.equal("completed");
    const other = await client.get(`${OTHER_LOCATION}/export/status/${jobId}`);
    expect(other.status, JSON.stringify(other.data)).to.equal(HTTP_FORBIDDEN);
  });

  it("serves an export's file on the table view that started it, and refuses it on another", async () => {
    const started = await client.get(`${LOCATION}/export/start`, {
      params: { format: "csv" },
    });
    expect(started.status, JSON.stringify(started.data)).to.equal(HTTP_OK);
    const { jobId } = parseBody(StartBody, started);
    expect(await settledStatus(jobId)).to.equal("completed");

    const other = await client.get(
      `${OTHER_LOCATION}/export/download/${jobId}`,
    );
    expect(other.status, JSON.stringify(other.data)).to.equal(HTTP_FORBIDDEN);
    const own = await client.get(`${LOCATION}/export/download/${jobId}`);
    expect(own.status, JSON.stringify(own.data)).to.equal(HTTP_OK);
  });
});
