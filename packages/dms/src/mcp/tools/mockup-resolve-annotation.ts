import { z } from "zod";
import {
  defaultMockupsDir,
  mockupTitle,
  notifyNoteResolved,
  readAnnotation,
  updateAnnotation,
} from "../../mockup";
import { defineTool, jsonResult, textResult } from "../tool";
import { mockupArgument, withMockup } from "./mockup-support";

/** `mockup_resolve_annotation`: marks a reviewer's note done. */
export const mockupResolveAnnotationTool = defineTool({
  name: "mockup_resolve_annotation",
  title: "Resolve a mockup annotation",
  description:
    "Marks one annotation of a mockup resolved, after you addressed it in the spec. Sets its status to 'resolved' and stamps resolvedAt and resolvedVersion (the history version that is newest now, so write the spec first); writes only mockups/<mockup>/annotations.json, never the spec. The people on the note (its author and whoever replied) are notified that the AI resolved it. Answers the updated annotation. An unknown mockup or id is an error: call mockup_annotations to list the ids. Resolving a resolved annotation changes nothing.",
  effect: "builder",
  alwaysLoad: true,
  input: z.object({
    mockup: mockupArgument,
    id: z.string().describe("An annotation id from mockup_annotations."),
  }),
  run: ({ mockup, id }) =>
    withMockup(mockup, async (name) => {
      const mockupsDir = defaultMockupsDir();
      const before = await readAnnotation(name, id, mockupsDir);
      const updated = await updateAnnotation(
        name,
        id,
        { status: "resolved" },
        mockupsDir,
      );
      if (updated.kind === "updated") {
        if (before?.status === "open") {
          await notifyNoteResolved(
            {
              name,
              title: await mockupTitle(name, mockupsDir),
              note: updated.annotation,
            },
            undefined,
          );
        }
        return jsonResult(updated.annotation);
      }
      return textResult(
        updated.kind === "no_mockup"
          ? `Mockup "${name}" does not exist: no mockups/${name}/ directory.`
          : `Mockup "${name}" has no annotation "${id}". Call mockup_annotations to list its ids.`,
        true,
      );
    }),
});
