import { z } from "zod";
import { defaultMockupsDir } from "../../mockup";
import { defineTool } from "../tool";
import {
  mockupArgument,
  saveSpec,
  specArgument,
  summaryArgument,
  withMockup,
  writeGroupArgument,
} from "./mockup-support";

/** `mockup_write_spec`: replaces a mockup's whole spec once it validates. */
export const mockupWriteSpecTool = defineTool({
  name: "mockup_write_spec",
  title: "Write a mockup spec",
  description:
    "Writes mockups/<mockup>/spec.json, the whole spec, creating the mockup when it is new. The spec is checked first exactly as the /mockup page checks it: nothing is written unless it has zero errors, and a refused write leaves the existing file untouched. Answers { ok, errors: [{ path, message }], warnings: [{ path, message }] } where path is a JSON pointer into your spec ('' is the whole file). On ok: false, fix each error at its pointer and call again. A warning never refuses the write: it names a fixture a block reads through fetchUrl 'fixture:<key>' but cannot draw, such as a ChartCard's series written as [{ label, value }] where it reads [{ name, data: [{ x, y }] }] or [{ x, y }], or a list block's fixture written as a bare array where it reads { items }. Each warning's path is the fixture and its message says which block reads it, what that block reads and what it got: fix the fixture, else the block draws no data. On ok: true the dev-only /mockup page re-renders by itself; then call mockup_annotations to read what the reviewer left. To change a few nodes of an existing spec, prefer mockup_patch_spec, and read the parts you need with mockup_read_spec. A block's id anchors the reviewer notes on it, so keep it when you move or rewrite the block.",
  effect: "builder",
  input: z.object({
    mockup: mockupArgument,
    spec: specArgument,
    summary: summaryArgument,
    writeGroup: writeGroupArgument,
  }),
  run: ({ mockup, spec, summary, writeGroup }, _sessionId, client) =>
    withMockup(mockup, (name) =>
      saveSpec(
        defaultMockupsDir(),
        name,
        client === "chat" ? { ...spec, source: "chat" } : spec,
        { summary, group: writeGroup },
      ),
    ),
});
