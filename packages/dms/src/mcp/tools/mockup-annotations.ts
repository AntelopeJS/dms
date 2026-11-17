import { z } from "zod";
import { defaultMockupsDir, listAnnotations } from "../../mockup";
import { defineTool, jsonResult, textResult } from "../tool";
import { mockupArgument, withMockup } from "./mockup-support";

/** `mockup_annotations`: the notes a reviewer left on a mockup. */
export const mockupAnnotationsTool = defineTool({
  name: "mockup_annotations",
  title: "Mockup annotations",
  description:
    "Lists the annotations a reviewer left on a mockup, oldest first, each { id, anchor, page?, path?, text, status, createdAt, resolvedAt? }. anchor names the annotated block by node id: { block, steps, page? }, page set when the block and the nodes above it have only author-written ids, which name a block of that page alone. page and path are where that block is in spec.json now (path is a JSON pointer), so they follow the block when you insert, move or remove nodes; both are absent when the block was removed or two blocks match its anchor. Changes nothing. Filter with status ('open' for what still needs work) and page (a page id; notes whose block was removed have none). Answers { annotations }. An unknown mockup is an error. After you change the spec to address one, call mockup_resolve_annotation with its id.",
  effect: "read",
  input: z.object({
    mockup: mockupArgument,
    status: z.enum(["open", "resolved"]).optional(),
    page: z
      .string()
      .optional()
      .describe("Only the annotations of this page id."),
  }),
  run: ({ mockup, status, page }) =>
    withMockup(mockup, async (name) => {
      const annotations = await listAnnotations(name, defaultMockupsDir());
      if (!annotations) {
        return textResult(
          `Mockup "${name}" does not exist: no mockups/${name}/ directory. Call mockup_write_spec to create it.`,
          true,
        );
      }
      return jsonResult({
        annotations: annotations.filter(
          (annotation) =>
            (status === undefined || annotation.status === status) &&
            (page === undefined || annotation.page === page),
        ),
      });
    }),
});
