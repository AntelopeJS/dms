import { randomBytes } from "node:crypto";
import { readdir, readFile, rm, rmdir } from "node:fs/promises";
import { join } from "node:path";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import type { McpTool } from "../../mcp/tool";
import { MCP_TOOLS } from "../../mcp/tools";
import { defaultMockupsDir, MISSING_FILE, parseFsError } from "../../mockup";

const NAME_BYTES = 4;

/** The mockup every test works on: unique to this process, so no real mockup is touched. */
export const NAME = `mcp-test-${randomBytes(NAME_BYTES).toString("hex")}`;

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

/** The names in `directory`, or none when it does not exist. */
export async function listing(directory: string): Promise<string[]> {
  try {
    return await readdir(directory);
  } catch (error) {
    if (parseFsError(error).code === MISSING_FILE) return [];
    throw error;
  }
}

/** Where the tools read and write, and the mockup the tests own there. */
export interface Workspace {
  /** The working directory, where `mockups/` lives. */
  root(): string;
  /** `mockups/` under the working directory. */
  mockups(): string;
  /** The text of `mockups/<NAME>/spec.json`. */
  specBytes(): Promise<string>;
}

async function clear(): Promise<void> {
  await rm(join(defaultMockupsDir(), NAME), { recursive: true, force: true });
  if ((await listing(defaultMockupsDir())).length === 0) {
    await rmdir(defaultMockupsDir()).catch((error: unknown) => {
      if (parseFsError(error).code !== MISSING_FILE) throw error;
    });
  }
}

/**
 * The tools resolve `mockups/` under the working directory, so a test works
 * on the mockup named `NAME` there. Each test starts and ends without it, and
 * without `mockups/` itself when it was left empty.
 */
export function useWorkspace(): Workspace {
  beforeEach(clear);
  afterEach(clear);
  return {
    root: () => process.cwd(),
    mockups: defaultMockupsDir,
    specBytes: () =>
      readFile(join(defaultMockupsDir(), NAME, "spec.json"), "utf8"),
  };
}
