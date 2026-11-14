import { z } from "zod";
import {
  applyMockupToPage,
  defaultMockupsDir,
  mockupEngineRunning,
  WIRING_REASONS,
} from "../../mockup";
import { defineTool, jsonResult, textResult } from "../tool";
import { mockupArgument, withMockup } from "./mockup-support";

const DEV_ONLY =
  "mockup_apply_to_page runs only while the project runs in development (ajs project dev): the /mockup page and its API exist nowhere else.";

const REASONS = Object.entries(WIRING_REASONS)
  .map(([reason, meaning]) => `'${reason}': ${meaning}`)
  .join(" ");

export const mockupApplyToPageTool = defineTool({
  name: "mockup_apply_to_page",
  title: "Build a mockup back into its live page",
  description: `Builds a mockup page converted from a live page (mockup_from_page, "Edit as mockup") back into that page, in one write of its whole block tree at the version the conversion read. Call it first when you build such a page, before any other builder tool. A block whose node is unchanged, or that a Custom sketch stands for, keeps its source byte for byte; option, order, slot and colSpan edits are written; blocks the mockup removed are removed; new blocks of the builder's own types are added, named after their id (an id that cannot name a block, such as revenue-2 or _draft, gives one that can, revenue_2 or block_draft), or after their type when they have no id. It never creates a page. Answers { ok: true, outcome: 'applied', livePage: { ref, version }, stamped, preserved, written, added, removed, wiring }, each list holding builder paths; unless stamped is false, the spec's livePage.version is updated to the new version, and each new node that had no id gets the name it was written under as its id, so the next apply pairs it with its block. wiring lists each node it did not write, as { pointer, id?, type?, reason, kept? }: pointer is the node's place in spec.json, and kept the builder path of the live block left as it was there. A note stands for its node and everything under it, except a 'parent' note, which is about kept, and a 'placement' note, whose node was written. Build each note with the builder tools after reading the page again with builder_page_structure, editing the kept block when there is one. Reasons: ${REASONS} Errors: 'stale' (with livePage and currentVersion) means the page changed since the conversion and nothing was written: tell the user, since converting it again (mockup_from_page with replace: true) discards the mockup's edits to that page; 'not_linked' means the spec page records no livePage, so build it with the builder tools; 'not_found' names a mockup, spec page or live page that does not exist; 'invalid' carries in errors the spec's schema issues or the builder's refusal of the draft; 'unreadable' means the builder cannot read the page. Development only.`,
  effect: "builder",
  input: z.object({
    mockup: mockupArgument,
    page: z
      .string()
      .describe(
        "The id of the spec page to build, as mockup_from_page answers it in `page`.",
      ),
  }),
  run: async ({ mockup, page }) => {
    if (!mockupEngineRunning()) return textResult(DEV_ONLY, true);
    return withMockup(mockup, async (name) => {
      const answer = await applyMockupToPage(defaultMockupsDir(), name, page);
      return jsonResult(answer, !answer.ok);
    });
  },
});
