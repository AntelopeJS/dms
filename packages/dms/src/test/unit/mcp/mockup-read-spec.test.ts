import { expect } from "chai";
import { z } from "zod";
import { isToolAllowed } from "../../../mcp/access";
import {
  mockupTool,
  NAME,
  run,
  sketch,
  spec,
  useWorkspace,
} from "../../helpers/mockup-mcp";

const read = mockupTool("mockup_read_spec");
const write = mockupTool("mockup_write_spec");

async function readNote(
  tool: typeof read,
  args: { mockup: string; path?: string },
): Promise<string | undefined> {
  const { content } = z
    .object({ content: z.array(z.object({ text: z.string() })) })
    .parse(await tool.call(args));
  return content[1]?.text;
}

const TREE = [sketch("<p>a</p>"), sketch("<p>b</p>")];

useWorkspace();

describe("[unit] mockup_read_spec", () => {
  beforeEach(async () => {
    await write.call({ mockup: NAME, spec: spec(...TREE) });
  });

  it("reads the whole spec when no path is given", async () => {
    const { text, isError } = await run(read, { mockup: NAME });

    expect(isError).to.equal(false);
    expect(JSON.parse(text)).to.deep.equal(spec(...TREE));
  });

  it("reads the whole spec for an empty path", async () => {
    const { text, isError } = await run(read, { mockup: NAME, path: "" });

    expect(isError).to.equal(false);
    expect(JSON.parse(text)).to.deep.equal(spec(...TREE));
  });

  it("reads the value at a JSON pointer", async () => {
    const block = await run(read, { mockup: NAME, path: "/pages/0/tree/1" });
    const title = await run(read, { mockup: NAME, path: "/pages/0/title" });

    expect(block.isError).to.equal(false);
    expect(JSON.parse(block.text)).to.deep.equal(TREE[1]);
    expect(JSON.parse(title.text)).to.equal("Home");
  });

  it("names the package of each listed module beside the spec, and only when the read reaches them (fails when the build skill sees bare ids or every read carries the note)", async () => {
    await write.call({
      mockup: NAME,
      spec: {
        version: 1,
        modules: ["mailing", "saas"],
        pages: [{ id: "home", title: "Home", tree: TREE }],
      },
    });
    const note = (path?: string) =>
      readNote(read, { mockup: NAME, ...(path !== undefined && { path }) });

    expect(await note()).to.contain(
      "mailing is @antelopejs/dms-mailing, saas is @antelopejs/dms-saas",
    );
    expect(await note("/modules")).to.contain("@antelopejs/dms-saas");
    expect(await note("/pages/0/title")).to.equal(undefined);
  });

  it("changes nothing", async () => {
    const before = await run(read, { mockup: NAME });

    await run(read, { mockup: NAME, path: "/pages/0/tree/0" });

    expect((await run(read, { mockup: NAME })).text).to.equal(before.text);
  });

  it("answers an unknown pointer with the keys of the nearest existing parent", async () => {
    const { text, isError } = await run(read, {
      mockup: NAME,
      path: "/pages/0/treee/0",
    });

    expect(isError).to.equal(true);
    expect(text).to.contain('no member "treee"');
    expect(text).to.contain('"/pages/0"');
    expect(text).to.contain("id, title, tree");
  });

  it("answers an index past the end of an array with the indexes it has", async () => {
    const { text, isError } = await run(read, {
      mockup: NAME,
      path: "/pages/0/tree/5",
    });

    expect(isError).to.equal(true);
    expect(text).to.contain('"/pages/0/tree"');
    expect(text).to.contain("0, 1");
  });

  it("answers a pointer that runs through a value without members", async () => {
    const { text, isError } = await run(read, {
      mockup: NAME,
      path: "/pages/0/title/x",
    });

    expect(isError).to.equal(true);
    expect(text).to.contain('"/pages/0/title"');
    expect(text).to.contain("it has no members");
  });

  it("refuses a path that is not a JSON pointer", async () => {
    const { text, isError } = await run(read, {
      mockup: NAME,
      path: "pages/0",
    });

    expect(isError).to.equal(true);
    expect(text).to.contain("is not a JSON pointer");
  });

  it("answers an unknown mockup with an error", async () => {
    const { text, isError } = await run(read, { mockup: `${NAME}-missing` });

    expect(isError).to.equal(true);
    expect(text).to.contain("has no spec.json to read");
  });

  it("is served in Safe mode, as a read tool", () => {
    expect(read.effect).to.equal("read");
    expect(isToolAllowed(read, "safe")).to.equal(true);
    expect(isToolAllowed(read, "full")).to.equal(true);
  });
});
