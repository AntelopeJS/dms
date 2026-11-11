import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import type { McpAccess } from "../../../mcp/access";
import { answerMcpMessage } from "../../../mcp/protocol";
import { defineTool, type McpTool, textResult } from "../../../mcp/tool";
import { MCP_TOOLS } from "../../../mcp/tools";

const ListAnswerSchema = z.object({
  result: z.object({
    tools: z.array(
      z.object({
        name: z.string(),
        inputSchema: z.object({
          properties: z.record(z.string(), z.unknown()),
        }),
      }),
    ),
  }),
});

const CallAnswerSchema = z.object({
  result: z.object({
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
    isError: z.boolean().optional(),
  }),
});

const ErrorAnswerSchema = z.object({
  id: z.union([z.string(), z.number(), z.null()]),
  error: z.object({ code: z.number(), message: z.string() }),
});

const calls = { project: 0, echo: 0 };

const echoTool = defineTool({
  name: "echo",
  title: "Echo",
  description: "Answers its text.",
  effect: "read",
  input: z.object({ text: z.string() }),
  async run({ text }) {
    calls.echo += 1;
    return textResult(text);
  },
});

const builderTool = defineTool({
  name: "build",
  title: "Build",
  description: "Edits through the builder.",
  effect: "builder",
  input: z.object({}),
  run: async () => textResult("built"),
});

const projectTool = defineTool({
  name: "configure",
  title: "Configure",
  description: "Changes the project's configuration.",
  effect: "project",
  input: z.object({}),
  async run() {
    calls.project += 1;
    return textResult("configured");
  },
});

const failingTool = defineTool({
  name: "failing",
  title: "Failing",
  description: "Throws.",
  effect: "read",
  input: z.object({}),
  run: async () => {
    throw new Error("disk full");
  },
});

const TOOLS = [echoTool, builderTool, projectTool, failingTool];

function request(id: number, method: string, params?: JsonValue): JsonValue {
  return params === undefined
    ? { jsonrpc: "2.0", id, method }
    : { jsonrpc: "2.0", id, method, params };
}

async function answer(access: McpAccess, message: JsonValue) {
  return answerMcpMessage({ access, tools: TOOLS }, message);
}

async function listed(
  access: McpAccess,
  tools: readonly McpTool[] = TOOLS,
): Promise<string[]> {
  const reply = await answerMcpMessage(
    { access, tools },
    request(1, "tools/list"),
  );
  return ListAnswerSchema.parse(reply).result.tools.map(({ name }) => name);
}

async function call(access: McpAccess, name: string, args: JsonValue) {
  return answer(access, request(2, "tools/call", { name, arguments: args }));
}

describe("[unit] mcp protocol", () => {
  beforeEach(() => {
    calls.project = 0;
    calls.echo = 0;
  });

  it("answers initialize in the client's protocol version when it speaks it, else in its newest", async () => {
    const known = await answer(
      "full",
      request(1, "initialize", { protocolVersion: "2025-03-26" }),
    );
    const unknown = await answer(
      "full",
      request(2, "initialize", { protocolVersion: "1999-01-01" }),
    );
    expect(known).to.deep.include({ id: 1 });
    expect(known).to.have.nested.property(
      "result.protocolVersion",
      "2025-03-26",
    );
    expect(known).to.have.nested.property("result.serverInfo.name", "dms");
    expect(unknown).to.have.nested.property(
      "result.protocolVersion",
      "2025-06-18",
    );
  });

  it("answers no notification, rather than an error the client never reads", async () => {
    const reply = await answer("full", {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(reply).to.equal(undefined);
  });

  it("answers no response the client sends, rather than refusing it as a request", async () => {
    const reply = await answer("full", { jsonrpc: "2.0", id: 4, result: {} });
    expect(reply).to.equal(undefined);
  });

  it("answers an unknown method with method not found under the request's id", async () => {
    const reply = ErrorAnswerSchema.parse(
      await answer("full", request(7, "resources/list")),
    );
    expect(reply.id).to.equal(7);
    expect(reply.error.code).to.equal(-32601);
  });

  it("keeps the id of a request it cannot read, instead of answering null", async () => {
    const reply = ErrorAnswerSchema.parse(
      await answer("full", { jsonrpc: "2.0", id: 3, method: 5 }),
    );
    expect(reply.id).to.equal(3);
    expect(reply.error.code).to.equal(-32600);
  });

  it("lists the read and builder tools under safe access, and every tool under full", async () => {
    expect(await listed("safe")).to.deep.equal(["echo", "build", "failing"]);
    expect(await listed("full")).to.deep.equal([
      "echo",
      "build",
      "configure",
      "failing",
    ]);
  });

  it("refuses to call a project tool under safe access without running it", async () => {
    const refused = ErrorAnswerSchema.parse(
      await call("safe", "configure", {}),
    );
    expect(refused.error.code).to.equal(-32602);
    expect(calls.project).to.equal(0);

    const ran = CallAnswerSchema.parse(await call("full", "configure", {}));
    expect(ran.result.content[0]?.text).to.equal("configured");
    expect(calls.project).to.equal(1);
  });

  it("refuses arguments the tool's schema rejects, naming the argument, without running the tool", async () => {
    const reply = CallAnswerSchema.parse(
      await call("safe", "echo", { text: 5 }),
    );
    expect(reply.result.isError).to.equal(true);
    expect(reply.result.content[0]?.text).to.match(/^text: /);
    expect(calls.echo).to.equal(0);

    const ran = CallAnswerSchema.parse(
      await call("safe", "echo", { text: "hi" }),
    );
    expect(ran.result).to.deep.equal({
      content: [{ type: "text", text: "hi" }],
    });
  });

  it("answers a tool that throws as a failed result, instead of failing the request", async () => {
    const reply = CallAnswerSchema.parse(await call("full", "failing", {}));
    expect(reply.result.isError).to.equal(true);
    expect(reply.result.content[0]?.text).to.equal("failing failed: disk full");
  });

  it("serves the builder tools under safe access and keeps the project configuration and resource deletion out", async () => {
    const safe = await listed("safe", MCP_TOOLS);
    const full = await listed("full", MCP_TOOLS);
    expect(safe).to.include.members([
      "builder_add_block",
      "builder_compose_page",
      "builder_map_resources",
      "database_describe",
      "navigate_to_page",
    ]);
    expect(safe).to.not.include.members([
      "builder_configure_project",
      "builder_delete_resource",
    ]);
    expect(full).to.include.members([
      ...safe,
      "builder_configure_project",
      "builder_delete_resource",
    ]);
    expect(full).to.have.lengthOf(safe.length + 2);
  });

  it("serves the theme tools under safe access, since they edit through the builder", async () => {
    expect(await listed("safe", MCP_TOOLS)).to.include.members([
      "builder_get_theme",
      "builder_set_theme",
      "builder_create_theme_layer",
    ]);
  });

  it("names every tool once, so a call never reaches the wrong one", async () => {
    const names = await listed("full", MCP_TOOLS);
    expect(new Set(names).size).to.equal(names.length);
  });

  it("hands out the arguments of a recursive input, the composed page's blocks", async () => {
    const reply = await answerMcpMessage(
      { access: "full", tools: MCP_TOOLS },
      request(1, "tools/list"),
    );
    const compose = ListAnswerSchema.parse(reply).result.tools.find(
      ({ name }) => name === "builder_compose_page",
    );
    expect(compose?.inputSchema.properties).to.include.keys([
      "pageRef",
      "blocks",
      "preview",
    ]);
  });
});
