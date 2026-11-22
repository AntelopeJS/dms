import { expect } from "chai";
import { z } from "zod";
import { type BridgeProcess, startBridge } from "../helpers/mcp-bridge-process";

const PROTOCOL_VERSION = "2025-06-18";
const INVALID_PARAMS = -32602;
const METHOD_NOT_FOUND = -32601;

const InitializeResult = z.object({
  protocolVersion: z.string(),
  serverInfo: z.object({ name: z.string() }),
  capabilities: z.object({ tools: z.unknown().optional() }),
});
const ToolsResult = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      annotations: z
        .object({ readOnlyHint: z.boolean().optional() })
        .optional(),
    }),
  ),
});

describe("[integration] mcp stdio bridge", function () {
  this.timeout(30_000);
  let bridge: BridgeProcess;

  before(async () => {
    bridge = await startBridge();
  });

  after(() => bridge.close());

  it("relays initialize to the route, which names the server and offers tools", async () => {
    const answer = await bridge.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
    });

    const result = InitializeResult.parse(answer.result);
    expect(result.serverInfo.name).to.equal("dms");
    expect(result.protocolVersion).to.equal(PROTOCOL_VERSION);
    expect(result.capabilities).to.have.property("tools");
  });

  it("lists the read, builder and project tools of the full scope, the read ones marked read-only", async () => {
    const answer = await bridge.request("tools/list");

    const { tools } = ToolsResult.parse(answer.result);
    const names = tools.map(({ name }) => name);
    expect(names).to.include.members([
      "builder_catalog",
      "builder_create_page",
      "builder_delete_resource",
      "database_connections",
      "typecheck",
    ]);
    const readOnly = (name: string) =>
      tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint;
    expect(readOnly("builder_catalog")).to.equal(true);
    expect(readOnly("builder_create_page")).to.equal(false);
  });

  it("answers an unknown tool and an unknown method with a JSON-RPC error each", async () => {
    const tool = await bridge.request("tools/call", {
      name: "no_such_tool",
      arguments: {},
    });
    const method = await bridge.request("resources/list");

    expect(tool.error?.code).to.equal(INVALID_PARAMS);
    expect(tool.error?.message).to.contain("Unknown tool: no_such_tool");
    expect(method.error?.code).to.equal(METHOD_NOT_FOUND);
  });
});
