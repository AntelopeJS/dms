import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import type { McpAccess } from "../../../mcp/access";
import { McpController, serveMcpSession } from "../../../mcp/route";
import { defineTool, textResult } from "../../../mcp/tool";
import { requestContextFixture } from "../../helpers/request-context";

const LOOPBACK = "127.0.0.1";

const ToolsAnswerSchema = z.object({
  result: z.object({ tools: z.array(z.object({ name: z.string() })) }),
});
const RefusalSchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});

const calls = { project: 0 };

const TOOLS = [
  defineTool({
    name: "read",
    title: "Read",
    description: "Reads.",
    effect: "read",
    input: z.object({}),
    run: async () => textResult("read"),
  }),
  defineTool({
    name: "configure",
    title: "Configure",
    description: "Changes the project's configuration.",
    effect: "project",
    input: z.object({}),
    async run() {
      calls.project += 1;
      return textResult("configured");
    },
  }),
];

/** Posts one message to the route as a bridge on this machine whose client asked for `requested`, and parses the answer with `schema`. */
async function post<Answer>(
  configured: McpAccess,
  requested: string | undefined,
  message: JsonValue,
  schema: z.ZodType<Answer>,
): Promise<Answer> {
  const token = serveMcpSession({ access: configured, tools: TOOLS });
  const ctx = requestContextFixture(
    new URL(`http://${LOOPBACK}/dms/mcp`),
    `Bearer ${token}`,
  );
  Object.defineProperty(ctx.rawRequest.socket, "remoteAddress", {
    value: LOOPBACK,
  });
  ctx.body = Promise.resolve(Buffer.from(JSON.stringify(message)));
  const answer = await new McpController().answer(
    ctx,
    ctx.rawRequest.headers.authorization,
    "route-session",
    undefined,
    requested,
  );
  return schema.parse(JSON.parse(z.string().parse(answer.getBody())));
}

async function listed(
  configured: McpAccess,
  requested: string | undefined,
): Promise<string[]> {
  const reply = await post(
    configured,
    requested,
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ToolsAnswerSchema,
  );
  return reply.result.tools.map(({ name }) => name);
}

describe("[unit] mcp route", () => {
  it("refuses a caller that is not on this machine before it reads the credential", async () => {
    const ctx = requestContextFixture(
      new URL("http://localhost/dms/mcp"),
      "Bearer any-token",
    );
    const answer = await new McpController().answer(
      ctx,
      ctx.rawRequest.headers.authorization,
      undefined,
      undefined,
      undefined,
    );
    expect(answer.getStatus()).to.equal(403);
  });

  it("admits a caller on 127.0.1.1 past the machine check, so only its credential decides", async () => {
    const ctx = requestContextFixture(
      new URL("http://127.0.1.1/dms/mcp"),
      "Bearer not-this-start",
    );
    Object.defineProperty(ctx.rawRequest.socket, "remoteAddress", {
      value: "127.0.1.1",
    });
    const answer = await new McpController().answer(
      ctx,
      ctx.rawRequest.headers.authorization,
      undefined,
      undefined,
      undefined,
    );
    expect(answer.getStatus()).to.equal(401);
  });

  it("serves a request whose client asked for safe access as safe on a full server, refusing a project tool without running it", async () => {
    expect(await listed("full", "safe")).to.deep.equal(["read"]);
    const refused = await post(
      "full",
      "safe",
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "configure", arguments: {} },
      },
      RefusalSchema,
    );
    expect(refused.error.message).to.contain("is not available in Safe mode");
    expect(calls.project).to.equal(0);
  });

  it("never widens a safe server for a request that asks for full access", async () => {
    expect(await listed("safe", "full")).to.deep.equal(["read"]);
  });

  it("serves the configured access to a request that asks for none, or for one it does not know", async () => {
    expect(await listed("full", undefined)).to.deep.equal([
      "read",
      "configure",
    ]);
    expect(await listed("full", "root")).to.deep.equal(["read", "configure"]);
    expect(await listed("safe", undefined)).to.deep.equal(["read"]);
  });
});
