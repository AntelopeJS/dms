import { z } from "zod";
import {
  defaultMockupsDir,
  listAnnotations,
  updateAnnotation,
} from "../../mockup";
import { defineTool, jsonResult, textResult } from "../tool";
import { mockupArgument, withMockup } from "./mockup-support";

/** `mockup_resolve_annotation`: marks a reviewer's note done. */
export const mockupResolveAnnotationTool = defineTool({
  name: "mockup_resolve_annotation",
  title: "Resolve a mockup annotation",
  description:
    "Marks one annotation of a mockup resolved, after you addressed it in the spec. Sets its status to 'resolved' and stamps resolvedAt; writes only mockups/<mockup>/annotations.json, never the spec. Answers the updated annotation. An unknown mockup or id is an error: call mockup_annotations to list the ids. Resolving a resolved annotation changes nothing.",
  effect: "builder",
  input: z.object({
    mockup: mockupArgument,
    id: z.string().describe("An annotation id from mockup_annotations."),
  }),
  run: ({ mockup, id }) =>
    withMockup(mockup, async (name) => {
      const directory = defaultMockupsDir();
      const updated = await updateAnnotation(
        name,
        id,
        { status: "resolved" },
        directory,
      );
      if (updated) return jsonResult(updated);
      const known = await listAnnotations(name, directory);
      return textResult(
        known
          ? `Mockup "${name}" has no annotation "${id}". Call mockup_annotations to list its ids.`
          : `Mockup "${name}" does not exist: no mockups/${name}/ directory.`,
        true,
      );
    }),
});
