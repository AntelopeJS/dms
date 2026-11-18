import { z } from "zod";
import {
  defaultMockupsDir,
  editPageAsMockup,
  mockupEngineRunning,
  mockupNameSchema,
} from "../../mockup";
import { defineTool, jsonResult, textResult } from "../tool";

const DEV_ONLY =
  "mockup_from_page runs only while the project runs in development (ajs project dev): the /mockup page and its API exist nowhere else.";

export const mockupFromPageTool = defineTool({
  name: "mockup_from_page",
  title: "Turn a page into a mockup",
  description:
    "Converts an existing page of the project into mockups/<mockup>/spec.json and answers where to open it: { ok, outcome, mockup, page, url }. This is the only way to make a mockup of a live page. Every block becomes a node; a block a mockup cannot draw (a custom component, code the builder cannot edit, a value set in code) becomes a Custom sketch listed in `sketches` with its builder path and reason, never dropped. Options the builder locks are left out of the mockup; the live page keeps them. The converted page opens on live data by default, each data block reading its live route; `liveRoutes` lists the fixture keys that do, and the /mockup Real data toggle switches the page, the Overview and the thumbnail to sample fixtures. The spec page records `livePage: { ref, version }`: to build the mockup, update that page with the builder tools, never create a new one. Called again for the same page it writes nothing and answers outcome 'reopened' with `stale: true` when the page changed since; pass replace: true to convert it again over that page of the mockup. To mock up a change across several pages of an existing app, start the mockup empty (mockup_write_spec) and convert each page to change into it with into: '<mockup>': the page joins that mockup at its real place, under the category made from its sidebar section (builder_list_pages: page.section, sections with section: true; the built-in Pages section is the mockup's default section, no category) and among that section's converted pages in the app's menu order, last in its section otherwise, answering outcome 'added'. It refuses with 'conflict' a page the mockup already holds (by livePage.ref) unless replace: true, which converts it again in its place, and answers 'not_found' for a mockup that does not exist. New pages of such a mockup are written with the spec tools; the mockup's sidebar lists only its own pages. Development only.",
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
        "Convert again over the mockup this page already has, or over its page in the `into` mockup, discarding its edits to that page.",
      ),
    into: mockupNameSchema
      .optional()
      .describe(
        "An existing mockup's name: convert the page into it, at its real place, instead of making the page's own mockup.",
      ),
  }),
  run: async ({ pageRef, replace, into }) => {
    if (!mockupEngineRunning()) return textResult(DEV_ONLY, true);
    const answer = await editPageAsMockup(
      defaultMockupsDir(),
      { pageRef },
      { replace, into },
    );
    return jsonResult(answer, !answer.ok);
  },
});
