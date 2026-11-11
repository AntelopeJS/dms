import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";
import {
  compileSpec,
  type MockupName,
  mockupDirectory,
  parseMockupName,
  parseSpec,
  SPEC_FILE,
  writeAtomically,
} from "../../mockup";
import { JsonObjectSchema } from "../json";
import { jsonResult, type McpToolResult, textResult } from "../tool";

const JSON_INDENT = 2;

/** Where a mockup tool reads and writes: the `mockups/` directory, resolved at each call. */
export type MockupsDirectory = () => string;

/** The `mockup` argument every mockup tool takes. */
export const mockupArgument = z
  .string()
  .describe(
    "The mockup's name: its directory under mockups/, a lowercase slug such as 'checkout'.",
  );

/**
 * The spec a write tool takes: the whole content of `spec.json`. `tools/list`
 * shows an object, because a recursive JSON schema has no JSON Schema form;
 * the transform then parses it as JSON.
 */
export const specArgument = z
  .record(z.string(), z.unknown())
  .describe(
    "The whole spec: { version: 1, title?, pages: [{ id, title, fixtures?, options?, tree }] }.",
  )
  .transform((spec, context) => {
    const json = JsonObjectSchema.safeParse(spec);
    if (json.success) return json.data;
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must hold JSON values only",
    });
    return z.NEVER;
  });

/**
 * Runs `run` on the mockup named `raw`, or answers an error result when
 * `raw` is not a valid name, so no tool reaches a path outside `mockups/<name>/`.
 */
export function withMockup(
  raw: string,
  run: (name: MockupName) => Promise<McpToolResult>,
): Promise<McpToolResult> {
  const name = parseMockupName(raw);
  if (name) return run(name);
  return Promise.resolve(
    textResult(
      `"${raw}" is not a valid mockup name: use a lowercase slug (a-z, 0-9 and "-", at most 64 characters, "schema" is reserved).`,
      true,
    ),
  );
}

/**
 * Validates `spec` as the watcher does (`parseSpec` on its JSON text, then
 * `compileSpec`) and writes `mockups/<name>/spec.json` only when nothing is
 * wrong. A refused spec leaves the file as it was.
 */
export async function saveSpec(
  mockupsDir: string,
  name: MockupName,
  spec: JsonValue,
): Promise<McpToolResult> {
  const read = parseSpec(JSON.stringify(spec));
  const issues = read.ok ? compileSpec(name, read.spec).issues : read.issues;
  if (issues.length) {
    const errors = issues.map(({ path, message }) => ({ path, message }));
    return jsonResult({ ok: false, errors });
  }
  const directory = mockupDirectory(mockupsDir, name);
  await mkdir(directory, { recursive: true });
  await writeAtomically(
    join(directory, SPEC_FILE),
    `${JSON.stringify(spec, null, JSON_INDENT)}\n`,
  );
  return jsonResult({ ok: true, errors: [] });
}
