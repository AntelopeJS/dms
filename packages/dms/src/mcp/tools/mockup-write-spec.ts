import { z } from "zod";
import { defaultMockupsDir } from "../../mockup";
import { defineTool } from "../tool";
import {
  mockupArgument,
  saveSpec,
  specArgument,
  withMockup,
} from "./mockup-support";

/** `mockup_write_spec`: replaces a mockup's whole spec once it validates. */
export const mockupWriteSpecTool = defineTool({
  name: "mockup_write_spec",
  title: "Write a mockup spec",
  description:
    "Writes mockups/<mockup>/spec.json, the whole spec, creating the mockup when it is new. The spec is checked first exactly as the /mockup page checks it: nothing is written unless it has zero errors, and a refused write leaves the existing file untouched. Answers { ok, errors: [{ path, message }] } where path is a JSON pointer into your spec ('' is the whole file). On ok: false, fix each error at its pointer and call again. On ok: true the dev-only /mockup page re-renders by itself; then call mockup_annotations to read what the reviewer left. To change a few nodes of an existing spec, prefer mockup_patch_spec.",
  effect: "builder",
  input: z.object({ mockup: mockupArgument, spec: specArgument }),
  run: ({ mockup, spec }) =>
    withMockup(mockup, (name) => saveSpec(defaultMockupsDir(), name, spec)),
});
