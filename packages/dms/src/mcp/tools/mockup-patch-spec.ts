import { z } from "zod";
import { defaultMockupsDir, readSpecText } from "../../mockup";
import { type JsonObject, JsonObjectSchema } from "../json";
import { defineTool, textResult } from "../tool";
import { applyPatch, patchOperationSchema } from "./json-patch";
import { mockupArgument, saveSpec, withMockup } from "./mockup-support";

const POINTER = z
  .string()
  .describe(
    "A JSON pointer into the spec, such as /pages/0/tree/2/options/title.",
  );

/**
 * The shape `tools/list` shows for an operation. Its `value` stays `unknown`
 * here because a recursive JSON schema has no JSON Schema form;
 * `patchOperationSchema` then checks each operation exactly.
 */
const operationInput = z.object({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
  path: POINTER,
  from: POINTER.optional().describe("The source pointer of a move or copy."),
  value: z
    .unknown()
    .optional()
    .describe("The JSON value an add, replace or test takes."),
});

function parseSpecObject(text: string): JsonObject | undefined {
  try {
    return JsonObjectSchema.parse(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/** `mockup_patch_spec`: edits a mockup's spec with RFC 6902 operations. */
export const mockupPatchSpecTool = defineTool({
  name: "mockup_patch_spec",
  title: "Patch a mockup spec",
  description:
    "Edits the existing mockups/<mockup>/spec.json with an RFC 6902 JSON Patch: an array of { op, path, value?, from? } where op is add, remove, replace, move, copy or test, and path is a JSON pointer into the spec, such as /pages/0/tree/2/options/title. The patch applies in order to the current spec, then the result is checked and written exactly as mockup_write_spec does. Answers { ok, errors: [{ path, message }] }; on ok: false nothing is written. A failed test op or a pointer that leads nowhere is an error naming the operation's index, and nothing is written. Needs a spec: for a new mockup call mockup_write_spec first. On ok: true the dev-only /mockup page re-renders by itself.",
  effect: "builder",
  input: z.object({
    mockup: mockupArgument,
    patch: z.array(operationInput).min(1),
  }),
  run: ({ mockup, patch: requested }) =>
    withMockup(mockup, async (name) => {
      const parsed = z.array(patchOperationSchema).safeParse(requested);
      if (!parsed.success) {
        return textResult(
          `Invalid patch: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
          true,
        );
      }
      const patch = parsed.data;
      const directory = defaultMockupsDir();
      const text = await readSpecText(directory, name);
      if (text === undefined) {
        return textResult(
          `Mockup "${name}" has no spec.json to patch. Call mockup_write_spec to create it.`,
          true,
        );
      }
      const current = parseSpecObject(text);
      if (!current) {
        return textResult(
          `mockups/${name}/spec.json is not a JSON object, so it cannot be patched. Call mockup_write_spec to replace it.`,
          true,
        );
      }
      const patched = applyPatch(current, patch);
      if (!patched.ok) {
        const { index, message } = patched;
        const operation = patch[index];
        return textResult(
          `Operation ${index} (${operation.op} ${operation.path}) failed: ${message}. Nothing was written.`,
          true,
        );
      }
      return saveSpec(directory, name, patched.document);
    }),
});
