import { z } from "zod";
import { defaultMockupsDir, parseSpecObject, readSpecText } from "../../mockup";
import { defineTool, jsonResult, textResult } from "../tool";
import { readPointer } from "./json-patch";
import { mockupArgument, withMockup } from "./mockup-support";

const MAX_LISTED_MEMBERS = 50;

function listMembers(members: string[]): string {
  if (members.length === 0) return "it has no members";
  const shown = members.slice(0, MAX_LISTED_MEMBERS).join(", ");
  const more = members.length - MAX_LISTED_MEMBERS;
  return `its members are: ${shown}${more > 0 ? `, and ${more} more` : ""}`;
}

/** `mockup_read_spec`: reads a mockup's spec, whole or at one JSON pointer. */
export const mockupReadSpecTool = defineTool({
  name: "mockup_read_spec",
  title: "Read a mockup spec",
  description:
    "Reads mockups/<mockup>/spec.json, or one part of it, and answers it as JSON text. path is an RFC 6901 JSON pointer into the spec, such as /pages/0/tree/2/options; leave it out, or pass an empty string, to read the whole spec. Read only the part you need: a page is /pages/<index>, its blocks /pages/<index>/tree, and mockup_annotations gives the pointer of each note's block, so use that rather than reading the whole spec. A pointer that leads nowhere is an error naming the deepest value that exists on the way and what it holds (its keys, or the indexes of an array), so you can correct it. Changes nothing. To change the spec, call mockup_patch_spec with the same pointers. An unknown mockup is an error.",
  effect: "read",
  alwaysLoad: true,
  input: z.object({
    mockup: mockupArgument,
    path: z
      .string()
      .optional()
      .describe(
        "A JSON pointer into the spec, such as /pages/0/tree/2/options/title. Empty or omitted: the whole spec.",
      ),
  }),
  run: ({ mockup, path }) =>
    withMockup(mockup, async (name) => {
      const text = await readSpecText(defaultMockupsDir(), name);
      if (text === undefined) {
        return textResult(
          `Mockup "${name}" has no spec.json to read. Call mockup_write_spec to create it.`,
          true,
        );
      }
      const spec = parseSpecObject(text);
      if (!spec) {
        return textResult(
          `mockups/${name}/spec.json is not a JSON object, so it cannot be read. Call mockup_write_spec to replace it.`,
          true,
        );
      }
      const read = readPointer(spec, path ?? "");
      if (read.ok) return jsonResult(read.value);
      return textResult(
        `Cannot read "${path}": ${read.message}. The deepest value that exists on the way is at "${read.parent}": ${listMembers(read.members)}.`,
        true,
      );
    }),
});
