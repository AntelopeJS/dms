import { z } from "zod";
import { defaultMockupsDir, listAnnotationsInSpec } from "../../mockup";
import { defineTool, jsonResult, textResult } from "../tool";
import { mockupArgument, withMockup } from "./mockup-support";

/** `mockup_annotations`: the notes a reviewer left on a mockup. */
export const mockupAnnotationsTool = defineTool({
  name: "mockup_annotations",
  title: "Mockup annotations",
  description:
    "Lists the annotations a reviewer pinned on a mockup, oldest first, each { id, anchor, offset, page?, path?, pointer?, node?, state?, text, status, createdAt, resolvedAt?, version?, resolvedVersion? }. state names the state of the sketch the reviewer saw when pinning the note (a key of the sketch's states, or of a custom page's states); without it, the note is about the sketch's own html. version is the number of the mockup's history version the note was pinned on and resolvedVersion the one it was resolved on. A note is on one block or on one page as a whole. On a block, anchor names it by node id: { block, steps, page? }, page set when the block and the nodes above it have only author-written ids, which name a block of that page alone; page and path are where that block is in spec.json now (path is a JSON pointer), so they follow the block when you insert, move or remove nodes. On a page, anchor is { page } and the note has page and no path: it is about page <page> as a whole. page and path are both absent when the block or page was removed or two blocks match the anchor. pointer is the JSON pointer of what the note is on in spec.json now, its block (the same as path) or its page ('/pages/2'), to use as is in mockup_patch_spec; node is that block as spec.json holds it now, so you need not read the spec to patch it; to read anything else, pass a pointer to mockup_read_spec. A note on a page has pointer and no node; a note whose block or page was removed has neither. offset { x, y } is where the reviewer dropped the pin, as fractions of the block's box (or the page's) from its top left corner: { x: 1, y: 0 } is the top right corner. Changes nothing. Filter with status ('open' for what still needs work) and page (a page id; notes whose block or page was removed have none). Answers { annotations }. An unknown mockup is an error. After you change the spec to address one, call mockup_resolve_annotation with its id.",
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
      const annotations = await listAnnotationsInSpec(
        name,
        defaultMockupsDir(),
      );
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
