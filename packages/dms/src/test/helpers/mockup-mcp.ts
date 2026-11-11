import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import type { McpTool } from "../../mcp/tool";
import { MCP_TOOLS } from "../../mcp/tools";

/** The mockup every test works on. */
export const NAME = "desk";

/** A `sketch` node: valid with no block registered. */
export function sketch(html: string): JsonValue {
  return { type: "sketch", options: { html, height: 120 } };
}

/** A one-page spec with `tree` on its page `home`. */
export function spec(...tree: JsonValue[]): JsonValue {
  return { version: 1, pages: [{ id: "home", title: "Home", tree }] };
}

/** What `mockup_write_spec` and `mockup_patch_spec` answer. */
export const writeAnswerSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })),
});

/** The tool the MCP server serves under `name`. */
export function mockupTool(name: string): McpTool {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`MCP_TOOLS serves no tool named ${name}`);
  return tool;
}

const callSchema = z.object({
  content: z.array(z.object({ text: z.string() })).min(1),
  isError: z.boolean().optional(),
});

/** Calls `tool` and reads its first text block. */
export async function run(
  tool: McpTool,
  args: JsonValue,
): Promise<{ text: string; isError: boolean }> {
  const { content, isError } = callSchema.parse(await tool.call(args));
  return { text: content[0].text, isError: isError === true };
}

/** Calls `tool`, expects a non-error answer, and parses its JSON text. */
export async function answer<Answer>(
  tool: McpTool,
  args: JsonValue,
  schema: z.ZodType<Answer, z.ZodTypeDef, unknown>,
): Promise<Answer> {
  const { text, isError } = await run(tool, args);
  expect(isError, text).to.equal(false);
  return schema.parse(JSON.parse(text));
}

/** The temporary project a test runs in. */
export interface Workspace {
  /** The project root: the working directory while the test runs. */
  root(): string;
  /** `mockups/` under the project root, where the tools read and write. */
  mockups(): string;
  /** The text of `mockups/<NAME>/spec.json`. */
  specBytes(): Promise<string>;
}

/**
 * Runs each test in an empty temporary directory as the working directory,
 * which is where the tools resolve `mockups/`, and restores it afterwards.
 */
export function useWorkspace(): Workspace {
  let previous = "";
  let root = "";
  beforeEach(async () => {
    previous = process.cwd();
    root = await mkdtemp(join(tmpdir(), "mockup-mcp-"));
    process.chdir(root);
  });
  afterEach(async () => {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  });
  const mockups = () => join(root, "mockups");
  return {
    root: () => root,
    mockups,
    specBytes: () => readFile(join(mockups(), NAME, "spec.json"), "utf8"),
  };
}
