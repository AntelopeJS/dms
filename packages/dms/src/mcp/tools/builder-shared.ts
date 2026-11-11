import type {
  OperationName,
  Operations,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { type McpToolResult, textResult } from "../tool";

export type BuilderAnswer = Exclude<
  Awaited<ReturnType<(typeof Operations)[OperationName]>>,
  void
>;

const BUILDER_ESCALATION_NOTE =
  "If the result is ok:false with error.code 'opaque_target' or 'unsupported', safe mode cannot make this change. Explain the limitation to the user and ask permission to switch to Code mode (direct file edits) for this step.";

const BUILDER_EXPR_REFUSAL =
  'Refused: safe mode does not allow raw `$expr` values in builder config. For a Form field or Column DataType, use `{ $dataType: "<id>", config: {…} }` (see builder_catalog for ids). To reference a generated resource class (e.g. a RelationType\'s `dataApiController`), use a reference value `{ $ref: { resource: "<name>" } }` instead — it is validated and allowed in safe mode. Only escalate to Code mode for genuinely arbitrary code.';

export const BUILDER_REF_NOTE =
  'To reference a builder-generated resource class inside config (e.g. a RelationType DataType\'s `dataApiController`), pass `{ $ref: { resource: "<ref>", as?: "dataApi" | "table" | "model" } }` (default `as` = "dataApi", the DataAPI controller). The resource must already exist (builder_list_resources). Unlike `$expr`, `$ref` is allowed in safe mode.';

export function withEscalationNote(description: string): string {
  return `${description}\n\n${BUILDER_ESCALATION_NOTE}`;
}

export function opResult(answer: BuilderAnswer): McpToolResult {
  const failed = "ok" in answer && answer.ok === false;
  return textResult(JSON.stringify(answer), failed);
}

export function refusalResult(code: string, detail: string): McpToolResult {
  return textResult(
    JSON.stringify({ ok: false, error: { code, detail } }),
    true,
  );
}

const EXPR_SENTINEL = z.object({ $expr: z.string() });

export const containsExprSentinel: z.ZodType<boolean, z.ZodTypeDef, unknown> =
  z.lazy(() =>
    z.union([
      EXPR_SENTINEL.transform(() => true),
      z.array(containsExprSentinel).transform((items) => items.some(Boolean)),
      z
        .record(z.string(), containsExprSentinel)
        .transform((members) => Object.values(members).some(Boolean)),
      z.unknown().transform(() => false),
    ]),
  );

export function exprRefusal(): McpToolResult {
  return refusalResult("unsupported", BUILDER_EXPR_REFUSAL);
}

export const TARGET_MODULE = z
  .string()
  .optional()
  .describe(
    "A project module id from antelope.config.ts to write into; omit for the project's own. The module generated for a connected database is one.",
  );

export const BLOCK_PATH_FORMAT =
  "A block path from builder_page_structure: `<pageRef>#<block>` for a top-level block, then `/<child>` per nesting level (e.g. `/dashboard#grid/row/kpi`). Separators: `#` after the page, `/` between blocks.";
export const BLOCK_PATH = z.string().describe(BLOCK_PATH_FORMAT);
export const PARENT_PATH = z
  .string()
  .describe(`Container block to nest under. ${BLOCK_PATH_FORMAT}`);
