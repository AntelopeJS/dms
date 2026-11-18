import { expect } from "chai";
import {
  answer,
  mockupTool,
  NAME,
  sketch,
  useWorkspace,
  writeAnswerSchema,
} from "../../helpers/mockup-mcp";

const write = mockupTool("mockup_write_spec");
const patch = mockupTool("mockup_patch_spec");
const annotations = mockupTool("mockup_annotations");

describe("[unit] mockup MCP tools: a mockup with no page", () => {
  const workspace = useWorkspace();

  it("creates the mockup from a spec with no page", async () => {
    const result = await answer(
      write,
      { mockup: NAME, spec: { version: 1, title: "Soon", pages: [] } },
      writeAnswerSchema,
    );

    expect(result).to.deep.equal({ ok: true, errors: [] });
    expect(JSON.parse(await workspace.specBytes())).to.deep.equal({
      version: 1,
      title: "Soon",
      pages: [],
    });
  });

  it("fills it page by page with a patch", async () => {
    await write.call({ mockup: NAME, spec: { version: 1, pages: [] } });

    const result = await answer(
      patch,
      {
        mockup: NAME,
        patch: [
          {
            op: "add",
            path: "/pages/-",
            value: { id: "home", title: "Home", tree: [sketch("<p>a</p>")] },
          },
        ],
      },
      writeAnswerSchema,
    );

    expect(result).to.deep.equal({ ok: true, errors: [] });
    expect(JSON.parse(await workspace.specBytes())).to.have.nested.property(
      "pages[0].id",
      "home",
    );
  });

  it("answers no annotation for it", async () => {
    await write.call({ mockup: NAME, spec: { version: 1, pages: [] } });

    const result = await annotations.call({ mockup: NAME });

    expect(JSON.stringify(result)).to.not.contain('"isError":true');
  });
});
