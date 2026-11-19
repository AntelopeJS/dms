import { expect } from "chai";
import { z } from "zod";
import { createAnnotation, mockupNameSchema } from "../../../mockup";
import {
  answer,
  mockupTool,
  NAME,
  run,
  sketch,
  useWorkspace,
  writeAnswerSchema,
} from "../../helpers/mockup-mcp";

const MOCKUP = mockupNameSchema.parse(NAME);
const annotations = mockupTool("mockup_annotations");
const write = mockupTool("mockup_write_spec");
const patch = mockupTool("mockup_patch_spec");

describe("[unit] mockup_annotations: what each note is on in the spec", () => {
  const workspace = useWorkspace();

  it("answers with each note the pointer of its block and the block's node, the pointer of its page for a page note, and neither once its block is gone (fails when the AI must read spec.json to patch a commented block)", async () => {
    const dir = workspace.mockups();
    await write.call({
      mockup: NAME,
      spec: {
        version: 1,
        pages: [
          { id: "home", title: "Home", tree: [sketch("<p>a</p>")] },
          { id: "other", title: "Other", tree: [sketch("<p>b</p>")] },
        ],
      },
    });
    const place = (page: string, path?: string) => ({
      page,
      ...(path !== undefined && { path }),
      text: page,
      offset: { x: 0, y: 0 },
    });
    await createAnnotation(MOCKUP, place("home", "/pages/0/tree/0"), dir);
    await createAnnotation(MOCKUP, place("other"), dir);
    await createAnnotation(MOCKUP, place("other", "/pages/1/tree/0"), dir);
    await patch.call({
      mockup: NAME,
      patch: [
        { op: "add", path: "/pages/0/tree/0", value: sketch("<p>new</p>") },
        { op: "remove", path: "/pages/1/tree/0" },
      ],
    });
    const sitesSchema = z.object({
      annotations: z.array(
        z.object({
          pointer: z.string().optional(),
          node: z.record(z.unknown()).optional(),
        }),
      ),
    });

    const { text } = await run(annotations, { mockup: NAME });
    const [onBlock, onPage, gone] = sitesSchema.parse(
      JSON.parse(text),
    ).annotations;

    expect(text).to.not.contain("\n");
    expect(onBlock?.pointer).to.equal("/pages/0/tree/1");
    expect(onBlock?.node).to.include({ type: "sketch" });
    expect(onBlock?.node?.options).to.deep.equal({
      html: "<p>a</p>",
      height: 120,
    });
    expect(onPage).to.deep.equal({ pointer: "/pages/1" });
    expect(gone).to.deep.equal({});
    const edited = await answer(
      patch,
      {
        mockup: NAME,
        patch: [
          {
            op: "replace",
            path: `${onBlock?.pointer}/options/html`,
            value: "<p>A</p>",
          },
        ],
      },
      writeAnswerSchema,
    );
    expect(edited.ok).to.equal(true);
    expect(await workspace.specBytes()).to.contain("<p>A</p>");
  });
});
