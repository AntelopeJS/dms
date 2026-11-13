import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http, { createServer, type Server } from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { mock } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { expect } from "chai";
import { z } from "zod";
import { MCP_SESSION_HEADER, runBridge } from "../../../mcp/bridge";

const WAIT_MS = 2_000;
const POLL_MS = 10;

const AddressSchema = z.object({ port: z.number() });
const MessageSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
});
const EchoAnswerSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.number(),
  result: z.object({ method: z.string() }),
});
const FailureSchema = z.object({
  id: z.union([z.string(), z.number(), z.null()]),
  error: z.object({ code: z.number(), message: z.string() }),
});

interface Received {
  authorization: string | undefined;
  session: string | string[] | undefined;
  body: string;
}

interface Reply {
  status: number;
  body?: string;
}

interface Backend {
  server: Server;
  url: string;
  received: Received[];
}

function echo(body: string): Reply {
  const { id, method } = MessageSchema.parse(JSON.parse(body));
  return id === undefined
    ? { status: 202 }
    : {
        status: 200,
        body: JSON.stringify({ jsonrpc: "2.0", id, result: { method } }),
      };
}

async function startBackend(
  reply: (body: string) => Reply | Promise<Reply>,
): Promise<Backend> {
  const received: Received[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      received.push({
        authorization: request.headers.authorization,
        session: request.headers[MCP_SESSION_HEADER],
        body,
      });
      Promise.resolve(reply(body)).then(
        (answer) => {
          response.writeHead(answer.status);
          response.end(answer.body ?? "");
        },
        () => response.destroy(),
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = AddressSchema.parse(server.address());
  return { server, url: `http://127.0.0.1:${port}/dms/mcp`, received };
}

async function closedPortUrl(): Promise<string> {
  const backend = await startBackend(echo);
  backend.server.close();
  await once(backend.server, "close");
  return backend.url;
}

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting");
    await delay(POLL_MS);
  }
}

let directory: string;
let configPath: string;
let input: PassThrough;
let written: string;
const backends: Server[] = [];

async function useConfig(url: string, token = "token-1"): Promise<void> {
  await writeFile(configPath, JSON.stringify({ url, token }));
}

async function serve(
  reply: (body: string) => Reply | Promise<Reply>,
): Promise<Backend> {
  const backend = await startBackend(reply);
  backends.push(backend.server);
  await useConfig(backend.url);
  return backend;
}

function lines(): string[] {
  return written.split("\n").filter((line) => line.length > 0);
}

async function startBridge(): Promise<void> {
  directory = await mkdtemp(join(tmpdir(), "dms-mcp-bridge-"));
  configPath = join(directory, "mcp.json");
  input = new PassThrough();
  const output = new PassThrough();
  written = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    written += chunk;
  });
  runBridge(configPath, input, output);
}

async function stopBridge(): Promise<void> {
  input.end();
  for (const server of backends.splice(0)) server.close();
  await rm(directory, { recursive: true, force: true });
}

function relaysMessages(): void {
  it("relays each newline-framed message, whole or split across chunks, and answers each on its own line", async () => {
    const backend = await serve(echo);
    input.write(
      '{"jsonrpc":"2.0","id":1,"method":"ping"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n{"jsonrpc":"2.0",',
    );
    input.write('"id":3,"method":"initialize"}\n');
    await until(() => lines().length === 3);
    const answered = lines().map((line) =>
      EchoAnswerSchema.parse(JSON.parse(line)),
    );
    expect(answered).to.have.deep.members([
      { jsonrpc: "2.0", id: 1, result: { method: "ping" } },
      { jsonrpc: "2.0", id: 2, result: { method: "tools/list" } },
      { jsonrpc: "2.0", id: 3, result: { method: "initialize" } },
    ]);
    expect(
      backend.received.map(({ authorization }) => authorization),
    ).to.deep.equal(["Bearer token-1", "Bearer token-1", "Bearer token-1"]);
  });

  it("relays the next message while a slow call runs, so a ping is not held behind it", async () => {
    const slowCall = Promise.withResolvers<void>();
    await serve(async (body) => {
      if (MessageSchema.parse(JSON.parse(body)).method === "tools/call") {
        await slowCall.promise;
      }
      return echo(body);
    });
    input.write('{"jsonrpc":"2.0","id":1,"method":"tools/call"}\n');
    input.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    await until(() => lines().length === 1);
    slowCall.resolve();
    await until(() => lines().length === 2);
    const order = lines().map(
      (line) => EchoAnswerSchema.parse(JSON.parse(line)).id,
    );
    expect(order).to.deep.equal([2, 1]);
  });

  it("names one session on every message of a bridge, and another one for each other bridge, so a hold stays with the client it refused", async () => {
    const backend = await serve(echo);
    input.write('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n');
    input.write('{"jsonrpc":"2.0","id":2,"method":"tools/call"}\n');
    await until(() => lines().length === 2);
    const other = new PassThrough();
    runBridge(configPath, other, new PassThrough());
    other.write('{"jsonrpc":"2.0","id":3,"method":"tools/call"}\n');
    await until(() => backend.received.length === 3);
    other.end();
    const [first, second, third] = backend.received.map(
      ({ session }) => session,
    );
    expect(first).to.be.a("string").and.not.equal("");
    expect(second).to.equal(first);
    expect(third).to.be.a("string").and.not.equal(first);
  });

  it("keeps a message whole when a string in it holds U+2028, which readline would split", async () => {
    const backend = await serve(echo);
    const message =
      '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"text":"a b"}}';
    input.write(`${message}\n`);
    await until(() => lines().length === 1);
    expect(backend.received.map(({ body }) => body)).to.deep.equal([message]);
  });

  it("writes nothing for a notification the backend accepts", async () => {
    await serve(echo);
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    input.write('{"jsonrpc":"2.0","id":9,"method":"ping"}\n');
    await until(() => lines().length === 1);
    await delay(50);
    expect(lines()).to.deep.equal([
      '{"jsonrpc":"2.0","id":9,"result":{"method":"ping"}}',
    ]);
  });
}

function explainsUnreachableBackends(): void {
  it("answers a request with the backend down with how to start it, under the request's id", async () => {
    await useConfig(await closedPortUrl());
    input.write('{"jsonrpc":"2.0","id":"call-1","method":"tools/list"}\n');
    await until(() => lines().length === 1);
    const failure = FailureSchema.parse(JSON.parse(lines()[0] ?? ""));
    expect(failure.id).to.equal("call-1");
    expect(failure.error.code).to.equal(-32603);
    expect(failure.error.message).to.match(
      /^The DMS backend is not running\. Start the project with ajs project dev, then retry\./,
    );
  });

  it("explains a refused credential instead of relaying the refusal's body", async () => {
    await serve(() => ({ status: 401, body: '{"error":"unauthorized"}' }));
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    await until(() => lines().length === 1);
    const failure = FailureSchema.parse(JSON.parse(lines()[0] ?? ""));
    expect(failure.error.message).to.equal(
      "The DMS backend refused the bridge's credential. Restart the project with ajs project dev, then retry.",
    );
  });

  it("tells a developer whose request the backend refused as relayed to set mcp.backendUrl, not apiBaseUrl", async () => {
    await serve(() => ({ status: 403, body: '{"error":"forbidden"}' }));
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    await until(() => lines().length === 1);
    const { message } = FailureSchema.parse(JSON.parse(lines()[0] ?? "")).error;
    expect(message).to.contain("mcp.backendUrl");
    expect(message).to.not.contain("apiBaseUrl");
  });

  it("refuses a URL that is not on this machine without opening a connection, and names mcp.backendUrl", async () => {
    const refuse = () => {
      throw new Error("no connection in this test");
    };
    const httpRequest = mock.method(http, "request", refuse);
    const httpsRequest = mock.method(https, "request", refuse);
    try {
      const urls = [
        "https://api.test.example.com/dms/mcp",
        "http://127.0.0.1.evil.example.com:5010/dms/mcp",
        "http://192.168.1.20:5010/dms/mcp",
        "http://[::ffff:10.0.0.1]:5010/dms/mcp",
        "not a url",
      ];
      for (const [index, url] of urls.entries()) {
        await useConfig(url);
        input.write(`{"jsonrpc":"2.0","id":${index},"method":"ping"}\n`);
        await until(() => lines().length === index + 1);
        expect(httpRequest.mock.callCount(), url).to.equal(0);
        expect(httpsRequest.mock.callCount(), url).to.equal(0);
        const failure = FailureSchema.parse(JSON.parse(lines()[index] ?? ""));
        expect(failure.id, url).to.equal(index);
        expect(failure.error.message, url).to.contain("mcp.backendUrl");
      }
    } finally {
      httpRequest.mock.restore();
      httpsRequest.mock.restore();
    }
  });
}

function handlesUnreadableLinesAndNewCredentials(): void {
  it("relays the backend's JSON-RPC parse error for a line it cannot read, whatever the HTTP status", async () => {
    const parseError =
      '{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}';
    await serve(() => ({ status: 400, body: parseError }));
    input.write("{not json\n");
    await until(() => lines().length === 1);
    expect(lines()).to.deep.equal([parseError]);
  });

  it("answers a line it cannot read with id null when the backend is down, since a notification is the only line left unanswered", async () => {
    await useConfig(await closedPortUrl());
    input.write("{not json\n");
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    await until(() => lines().length === 1);
    await delay(50);
    const failure = FailureSchema.parse(JSON.parse(lines()[0] ?? ""));
    expect(lines()).to.have.lengthOf(1);
    expect(failure.id).to.equal(null);
    expect(failure.error.code).to.equal(-32603);
  });

  it("reads the credential per message, so a restarted backend is reached without a reconnect", async () => {
    const backend = await serve(echo);
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    await until(() => lines().length === 1);
    await useConfig(backend.url, "token-2");
    input.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    await until(() => lines().length === 2);
    expect(
      backend.received.map(({ authorization }) => authorization),
    ).to.deep.equal(["Bearer token-1", "Bearer token-2"]);
  });
}

describe("[unit] mcp stdio bridge", () => {
  beforeEach(startBridge);
  afterEach(stopBridge);

  relaysMessages();
  explainsUnreachableBackends();
  handlesUnreadableLinesAndNewCredentials();
});
