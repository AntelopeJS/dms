import { expect } from "chai";
import { z } from "zod";
import {
  listVersions,
  type MockupName,
  mockupNameSchema,
  readVersions,
} from "../../../mockup";
import {
  answer,
  mockupTool,
  NAME,
  run,
  sketch,
  spec,
  useWorkspace,
  type Workspace,
  writeAnswerSchema,
} from "../../helpers/mockup-mcp";

const write = mockupTool("mockup_write_spec");
const patch = mockupTool("mockup_patch_spec");
const HTML_PATH = "/pages/0/tree/0/options/html";
const listedWriteGroupSchema = z.object({
  properties: z.object({
    writeGroup: z.object({ type: z.string(), description: z.string() }),
  }),
  required: z.array(z.string()).optional(),
});

describe("[unit] mockup history: the AI tools", () => {
  const workspace: Workspace = useWorkspace();
  const name: MockupName = mockupNameSchema.parse(NAME);

  it("records writes and patches by the AI, folded into one version", async () => {
    await answer(
      write,
      { mockup: NAME, spec: spec(sketch("<p>a</p>")) },
      writeAnswerSchema,
    );
    await answer(
      patch,
      {
        mockup: NAME,
        patch: [{ op: "replace", path: HTML_PATH, value: "<p>b</p>" }],
      },
      writeAnswerSchema,
    );

    const versions = await listVersions(workspace.mockups(), name);
    expect(versions.map(({ seq, by }) => [seq, by])).to.deep.equal([[1, "ai"]]);
    expect(versions[0].summary).to.equal("Created with 1 page");
  });

  it("takes the summary the tool is given in place of the automatic one", async () => {
    await answer(
      write,
      { mockup: NAME, spec: spec(sketch("<p>a</p>")), summary: "First draft" },
      writeAnswerSchema,
    );

    const [version] = await listVersions(workspace.mockups(), name);
    expect(version.summary).to.equal("First draft");
  });

  it("refuses a summary longer than the limit", async () => {
    const { isError } = await run(write, {
      mockup: NAME,
      spec: spec(sketch("<p>a</p>")),
      summary: "x".repeat(201),
    });

    expect(isError).to.equal(true);
  });

  it("records the writes of one writeGroup as one version and those of the next group as another, and takes an invalid writeGroup as none without refusing the write (fails when the host's group is dropped)", async () => {
    const edit = (html: string, writeGroup?: string | number) =>
      answer(
        patch,
        {
          mockup: NAME,
          patch: [{ op: "replace", path: HTML_PATH, value: html }],
          ...(writeGroup !== undefined && { writeGroup }),
        },
        writeAnswerSchema,
      );
    await answer(
      write,
      { mockup: NAME, spec: spec(sketch("<p>a</p>")), writeGroup: "reply-1" },
      writeAnswerSchema,
    );
    await edit("<p>b</p>", "reply-1");
    await edit("<p>c</p>", "reply-2");
    const numbered = await edit("<p>d</p>", 42);
    const tooLong = await edit("<p>e</p>", "x".repeat(129));

    expect([numbered.ok, tooLong.ok]).to.deep.equal([true, true]);
    const versions = await readVersions(workspace.mockups(), name);
    expect(
      versions.map(({ seq, group, spec: written }) => [
        seq,
        group,
        JSON.stringify(written).match(/<p>(\w)<\/p>/)?.[1],
      ]),
    ).to.deep.equal([
      [1, "reply-1", "b"],
      [2, "reply-2", "c"],
      [3, undefined, "e"],
    ]);
  });

  it("offers writeGroup on both write tools as an optional string the host sets and the model leaves out", () => {
    for (const tool of [write, patch]) {
      const schema = listedWriteGroupSchema.parse(tool.inputSchema);
      expect(schema.properties.writeGroup.type, tool.name).to.equal("string");
      expect(schema.properties.writeGroup.description, tool.name).to.contain(
        "Leave this out",
      );
      expect(schema.required ?? [], tool.name).to.not.include("writeGroup");
    }
  });
});
