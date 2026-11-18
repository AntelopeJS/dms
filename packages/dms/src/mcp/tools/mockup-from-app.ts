import { z } from "zod";
import {
  defaultMockupsDir,
  editAppAsMockup,
  mockupEngineRunning,
  mockupNameSchema,
} from "../../mockup";
import { defineTool, jsonResult, textResult } from "../tool";

const DEV_ONLY =
  "mockup_from_app runs only while the project runs in development (ajs project dev): the /mockup page and its API exist nowhere else.";

export const mockupFromAppTool = defineTool({
  name: "mockup_from_app",
  title: "Turn the whole app into a mockup",
  description:
    "Starts a mockup of an existing app from the whole platform: writes mockups/<mockup>/spec.json with the app's menu as it is, its sidebar sections (builder_list_pages categories with section: true, Pages aside) as its categories in the sidebar's order, and every page of the menu in its place as a live reference page ({ id, title, icon?, category?, menu?, live: { ref } }), which the viewer draws as the live page itself, read-only, with real data. Each page named in `pages` is converted in place instead, as mockup_from_page converts it (livePage, liveRoutes, sample fixtures). A page whose route takes a parameter is left out. Answers { ok, outcome, mockup, url, live, converted, sketches, liveRoutes }. Then edit the converted pages and add new pages (no live, no livePage) where they belong in the spec's page order; to edit a page left live, replace its live reference with a converted page by writing the spec. The build (dms-mockup-build) leaves live reference pages untouched and builds only the converted and new pages. Refuses a mockup name that exists. Development only.",
  effect: "builder",
  input: z.object({
    mockup: mockupNameSchema.describe(
      "The new mockup's name, a slug such as 'app': mockups/<mockup>/spec.json.",
    ),
    pages: z
      .array(z.string())
      .optional()
      .describe(
        "The refs of the pages to convert in place, as builder_list_pages lists them, e.g. ['/orders']. Every other page stays a live reference.",
      ),
  }),
  run: async ({ mockup, pages }) => {
    if (!mockupEngineRunning()) return textResult(DEV_ONLY, true);
    const answer = await editAppAsMockup(defaultMockupsDir(), mockup, pages);
    return jsonResult(answer, !answer.ok);
  },
});
