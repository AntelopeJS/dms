import { z } from "zod";
import {
  defaultMockupsDir,
  editPageAsMockup,
  mockupEngineRunning,
} from "../../mockup";
import { defineTool, jsonResult, textResult } from "../tool";

const DEV_ONLY =
  "mockup_from_page runs only while the project runs in development (ajs project dev): the /mockup page and its API exist nowhere else.";

/** `mockup_from_page`: converts a live page into a mockup the developer edits on `/mockup`. */
export const mockupFromPageTool = defineTool({
  name: "mockup_from_page",
  title: "Turn a page into a mockup",
  description:
    "Converts an existing page of the project into mockups/<mockup>/spec.json and answers where to open it: { ok, outcome, mockup, page, url }. This is the only way to make a mockup of a live page. Every block becomes a node; a block a mockup cannot draw (a custom component, code the builder cannot edit, a value set in code) becomes a Custom sketch listed in `sketches` with its builder path and reason, never dropped. Options the builder locks are left out of the mockup; the live page keeps them. Data blocks read sample fixtures; `liveRoutes` lists the fixture keys the /mockup Real data toggle reads from their live route instead. The spec page records `livePage: { ref, version }`: to build the mockup, update that page with the builder tools, never create a new one. Called again for the same page it writes nothing and answers outcome 'reopened' with `stale: true` when the page changed since; pass replace: true to convert it again over that page of the mockup. Development only.",
  effect: "builder",
  input: z.object({
    pageRef: z
      .string()
      .describe(
        "The page's builder ref, as builder_list_pages lists it, e.g. '/books'.",
      ),
    replace: z
      .boolean()
      .optional()
      .describe(
        "Convert again over the mockup this page already has, discarding its edits to that page.",
      ),
  }),
  run: async ({ pageRef, replace }) => {
    if (!mockupEngineRunning()) return textResult(DEV_ONLY, true);
    const answer = await editPageAsMockup(
      defaultMockupsDir(),
      { pageRef },
      { replace },
    );
    return jsonResult(answer, !answer.ok);
  },
});
