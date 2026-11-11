import { z } from "zod";
import { listAnnotations } from "../../mockup/annotations";
import { defaultMockupsDir } from "../../mockup/files";
import { defineTool, jsonResult, type McpTool, textResult } from "../tool";
import {
  mockupArgument,
  type MockupsDirectory,
  withMockup,
} from "./mockup-support";

/**
 * `mockup_annotations`: the notes a reviewer left on a mockup. Resolves the
 * `mockups/` directory at each call.
 */
export function mockupAnnotationsTool(
  mockupsDir: MockupsDirectory = defaultMockupsDir,
): McpTool {
  return defineTool({
    name: "mockup_annotations",
    title: "Mockup annotations",
    description:
      "Lists the annotations a reviewer left on a mockup, oldest first, each { id, page, path, text, status, createdAt, resolvedAt? }. path is a JSON pointer to the annotated node in spec.json. Changes nothing. Filter with status ('open' for what still needs work) and page (a page id). Answers { annotations }. An unknown mockup is an error. After you change the spec to address one, call mockup_resolve_annotation with its id.",
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
        const annotations = await listAnnotations(name, mockupsDir());
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
}
