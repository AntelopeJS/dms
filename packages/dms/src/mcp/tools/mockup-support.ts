import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";
import {
  MAX_SUMMARY_LENGTH,
  type MockupIssue,
  mockupWriteGroupSchema,
  type MockupName,
  parseMockupName,
  type SpecWriteMeta,
  type SpecWriteResult,
  writeSpec,
} from "../../mockup";
import { JsonObjectSchema } from "../json";
import { jsonResult, type McpToolResult, textResult } from "../tool";

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
    "The whole spec: { version: 1, title?, pages: [{ id, title, fixtures?, options?, tree }] }. pages may be empty.",
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

/** The optional `summary` argument of the write tools: the label of the version it makes. */
export const summaryArgument = z
  .string()
  .max(MAX_SUMMARY_LENGTH)
  .optional()
  .describe(
    "One short line saying what this write changes, shown in the mockup's version history. Optional: without it the history describes the change by itself.",
  );

/**
 * The optional `writeGroup` argument of the write tools, which the host sets
 * and the model leaves out: the DMS assistant gives every write of one reply
 * the same group, so they make one version. A value that is not a valid
 * group is read as none, and the write goes on.
 */
export const writeGroupArgument = mockupWriteGroupSchema
  .optional()
  .catch(undefined)
  .describe(
    "Leave this out: the host that runs you sets it. It groups the writes of one assistant reply into one version of the mockup's history. 1 to 128 letters, digits, _ and -; any other value is ignored.",
  );

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
      `"${raw}" is not a valid mockup name: use a lowercase slug (a-z, 0-9 and "-", at most 64 characters, "schema" and "example" are reserved).`,
      true,
    ),
  );
}

/** Answers `{ ok, errors, warnings }` for a write's outcome. */
export function reportWrite(written: SpecWriteResult): McpToolResult {
  const issues = (list: readonly MockupIssue[]) =>
    list.map(({ path, message }) => ({ path, message }));
  const warnings = issues(written.warnings);
  if (written.ok) return jsonResult({ ok: true, errors: [], warnings });
  return jsonResult({ ok: false, errors: issues(written.errors), warnings });
}

/**
 * Writes `mockups/<name>/spec.json` through {@link writeSpec} as the AI's,
 * with the summary and the write group of its version, answering
 * `{ ok, errors }`. A refused spec leaves the file as it was.
 */
export async function saveSpec(
  mockupsDir: string,
  name: MockupName,
  spec: JsonValue,
  version: Pick<SpecWriteMeta, "summary" | "group">,
): Promise<McpToolResult> {
  return reportWrite(
    await writeSpec(mockupsDir, name, spec, { by: "ai", ...version }),
  );
}
