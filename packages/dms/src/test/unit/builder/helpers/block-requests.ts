import { expect } from "chai";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";
import { startBuilder } from "../../../../builder";
import { getBuilderConfig, setBuilderConfig } from "../../../../config";
import {
  AddQuery,
  CreateCategory,
  CreatePage,
  CreateResource,
} from "../../../../implementations/dms-builder";
import { recordLaunchEnvironment } from "../../../../implementations/dms-builder/engine";
import { answerMcpMessage } from "../../../../mcp/protocol";
import { MCP_TOOLS } from "../../../../mcp/tools";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "../harness";

export const PAGE = "/shop/board";
export const PAGE_FILE = "board/page.ts";
export const PAGE_ROUTES = "/dms/pages/shop/board";
export const DRIFT_PAGE = "/shop/drift";
export const DRIFT_FILE = "drift/page.ts";
export const ALLOWED_LOAD = "/api/builder/list";
export const FOREIGN_LOAD = "/api/builder/database/connections";
export const CONNECT_CHECK = "/api/builder/database/connections/check";
export const ATTACKER_URL = { url: "mongodb://attacker.invalid:27017/stolen" };
export const OP_TIMEOUT = 120_000;

const ToolAnswerSchema = z.object({
  result: z.object({
    content: z.array(z.object({ text: z.string() })),
    isError: z.boolean().optional(),
  }),
});

const RefusalSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.literal("invalid_config"),
    issues: z.array(z.object({ pointer: z.string(), message: z.string() })),
  }),
});

let app: Fixture;
let configured: ReturnType<typeof getBuilderConfig>;
let declaredQueryRoute = "";

/** Calls a builder tool once, as an agent in Safe mode does. */
export async function call(name: string, args: JsonValue) {
  const answer = await answerMcpMessage(
    { access: "safe", tools: MCP_TOOLS },
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    },
    "test-session",
  );
  const { content, isError } = ToolAnswerSchema.parse(answer).result;
  return { text: content.map(({ text }) => text).join(""), isError };
}

/** The pointers of the refused options, failing when the call was not refused. */
export async function refusedPointers(name: string, args: JsonValue) {
  const { text, isError } = await call(name, args);
  expect(isError, text).to.equal(true);
  return RefusalSchema.parse(JSON.parse(text)).error.issues.map(
    ({ pointer }) => pointer,
  );
}

/** A Form for the board page, with one text field and these options over it. */
export function addForm(name: string, config: Record<string, JsonValue>) {
  return {
    page: PAGE,
    name,
    type: "Form",
    config: {
      title: "Reconnect",
      kind: "action",
      fields: [{ id: "note", label: "Note", type: { $dataType: "string" } }],
      ...config,
    },
  };
}

/** A page and a resource named `builder`, whose DataAPI sits at `/api/builder`, with the engine behind the interface. */
export async function createShop(): Promise<void> {
  configured = getBuilderConfig();
  app = createFixture();
  setBuilderConfig({ ...getBuilderConfig(), enabled: true });
  await startBuilder(false, "test");
  expectOk(
    await CreateCategory({ name: "shop", displayName: "Shop" }),
    "CreateCategory",
  );
  expectOk(
    await CreatePage({
      name: "board",
      displayName: "Board",
      category: "pages.shop",
    }),
    "CreatePage",
  );
  expectOk(
    await CreatePage({
      name: "drift",
      displayName: "Drift",
      category: "pages.shop",
    }),
    "CreatePage drift",
  );
  expectOk(
    await CreateResource({
      name: "builder",
      fields: [{ name: "title", dataType: { $dataType: "string" } }],
    }),
    "CreateResource",
  );
  declaredQueryRoute = expectOk(
    await AddQuery(PAGE, {
      name: "titles",
      resource: "builder",
      template: "count",
    }),
    "AddQuery",
  ).route;
}

/** Puts back the refusing interface the test runtime started with. */
export async function destroyShop(): Promise<void> {
  destroyFixture();
  setBuilderConfig(configured);
  await startBuilder(false, "test");
  recordLaunchEnvironment(undefined);
}

/** An emitted file of the shop's app, relative to its `src`. */
export function readShop(relativePath: string): string {
  return app.read(relativePath);
}

/** Writes an emitted file of the shop's app back, relative to its `src`. */
export function writeShop(relativePath: string, text: string): void {
  app.write(relativePath, text);
}

/** The route of the count query the board page declares. */
export function queryRoute(): string {
  return declaredQueryRoute;
}
