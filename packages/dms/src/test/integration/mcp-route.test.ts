import { expect } from "chai";
import { z } from "zod";
import { createClient } from "../helpers/http";
import { readBridgeConfig } from "../helpers/mcp";

const ROUTE = "/dms/mcp";
const OVER_ONE_MEBIBYTE = 1024 * 1024 + 1;

const ToolsAnswerSchema = z.object({
  id: z.number(),
  result: z.object({ tools: z.array(z.object({ name: z.string() })) }),
});

describe("[integration] mcp route", () => {
  const client = createClient();
  const ping = { jsonrpc: "2.0", id: 1, method: "ping" };

  function bearer(): string {
    return `Bearer ${readBridgeConfig().token}`;
  }

  it("refuses a request a proxy relayed, even with this start's credential", async () => {
    const relayed = {
      "x-forwarded-for": "203.0.113.7",
      forwarded: "for=203.0.113.7",
      "x-real-ip": "203.0.113.7",
      via: "1.1 proxy.example.com",
      "x-forwarded-host": "app.example.com",
      "x-forwarded-proto": "https",
      "true-client-ip": "203.0.113.7",
      "cf-connecting-ip": "203.0.113.7",
    };
    for (const [header, value] of Object.entries(relayed)) {
      const response = await client.post(ROUTE, ping, {
        headers: { authorization: bearer(), [header]: value },
      });
      expect(response.status, header).to.equal(403);
    }
  });

  it("refuses a missing or wrong credential", async () => {
    const missing = await client.post(ROUTE, ping);
    const wrong = await client.post(ROUTE, ping, {
      headers: { authorization: "Bearer not-this-start" },
    });
    expect(missing.status).to.equal(401);
    expect(wrong.status).to.equal(401);
  });

  it("answers initialize and lists the tools for this start's credential", async () => {
    const headers = { authorization: bearer() };
    const initialized = await client.post(
      ROUTE,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18" },
      },
      { headers },
    );
    expect(initialized.status).to.equal(200);
    expect(initialized.data).to.have.nested.property(
      "result.serverInfo.name",
      "dms",
    );

    const listed = await client.post(
      ROUTE,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { headers },
    );
    const names = ToolsAnswerSchema.parse(listed.data).result.tools.map(
      ({ name }) => name,
    );
    expect(names).to.include.members([
      "builder_catalog",
      "builder_configure_project",
      "list_pages",
      "query_logs",
    ]);
  });

  it("accepts a notification with 202 and no body", async () => {
    const response = await client.post(
      ROUTE,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { headers: { authorization: bearer() }, responseType: "text" },
    );
    expect(response.status).to.equal(202);
    expect(response.data).to.equal("");
  });

  it("refuses a body past 1 MiB with 413", async () => {
    const response = await client.post(ROUTE, "x".repeat(OVER_ONE_MEBIBYTE), {
      headers: { authorization: bearer(), "content-type": "application/json" },
    });
    expect(response.status).to.equal(413);
  });

  it("answers a body that is not JSON with a JSON-RPC parse error", async () => {
    const response = await client.post(ROUTE, "{ not json", {
      headers: { authorization: bearer(), "content-type": "application/json" },
      transformRequest: [(body: string) => body],
    });
    expect(response.status).to.equal(400);
    expect(response.data).to.have.nested.property("error.code", -32700);
  });
});
