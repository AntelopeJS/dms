import { randomUUID } from "node:crypto";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { createMockupFromPageTool } from "../../../mcp/tools";
import {
  defaultMockupsDir,
  endMockupEngine,
  type JsonObject,
  isJsonObject,
  jsonObjectSchema,
  specValueAt,
  startMockupEngine,
} from "../../../mockup";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { stubPages, structureOf } from "../../helpers/live-page";
import { followEvents, type FollowedStream } from "../../helpers/mockup-events";
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
import { MOCKUP_API } from "../../helpers/mockup-routes";

const HELD = "/pages/0/tree/0";
const OTHER = "/pages/0/tree/1";
const REF = "/books";
const MESSAGE = "Test User is editing this block";
const URL = `${MOCKUP_API}/${NAME}`;

const sourceSchema = z.object({ spec: jsonObjectSchema, digest: z.string() });

const write = mockupTool("mockup_write_spec");
const patch = mockupTool("mockup_patch_spec");
const fromPage = createMockupFromPageTool(
  stubPages([
    structureOf(REF, [
      {
        name: "revenue",
        type: "KpiCard",
        config: { title: "Turnover", fetchUrl: "/api/books/revenue" },
      },
    ]),
  ]),
);

const held = () => spec(sketch("<p>held</p>"), sketch("<p>free</p>"));

const livePage = (): JsonObject => ({
  version: 1,
  pages: [
    {
      id: "books",
      title: "Books",
      livePage: { ref: REF, version: "an-older-version" },
      tree: [sketch("<p>held</p>"), sketch("<p>free</p>")],
    },
  ],
});

/** The HTML of the sketch at `pointer` in the file of the mockup. */
async function htmlAt(workspace: Workspace, pointer: string) {
  const file = jsonObjectSchema.parse(JSON.parse(await workspace.specBytes()));
  return specValueAt(file, `${pointer}/options/html`);
}

/** The spec the tools are called with: the file as it is, the sketch at `pointer` rewritten. */
async function rewritten(
  workspace: Workspace,
  pointer: string,
): Promise<JsonObject> {
  const file = jsonObjectSchema.parse(JSON.parse(await workspace.specBytes()));
  const options = specValueAt(file, `${pointer}/options`);
  if (!isJsonObject(options)) throw new Error(`${pointer} is no sketch`);
  options.html = "<p>changed</p>";
  return file;
}

const replaceHtml = (pointer: string) => ({
  mockup: NAME,
  patch: [
    { op: "replace", path: `${pointer}/options/html`, value: "<p>changed</p>" },
  ],
});

interface Viewer {
  hold: (initial: JsonValue) => Promise<void>;
}

/** Serves the mockup engine, and has a viewer of the owner hold the block at `HELD` once a test asks. */
function useViewer(): Viewer {
  let owner: AxiosInstance;
  let token: string;
  let stream: FollowedStream | undefined;

  before(async () => {
    token = (await registerUser({ owner: true })).accessToken;
    owner = authorizedClient(token);
    startMockupEngine(defaultMockupsDir());
  });
  after(() => endMockupEngine());
  afterEach(() => stream?.close());

  return {
    async hold(initial) {
      await write.call({ mockup: NAME, spec: initial });
      const viewer = randomUUID();
      stream = await followEvents(NAME, token, viewer);
      const read = sourceSchema.parse((await owner.get(`${URL}/spec`)).data);
      const taken = await owner.put(`${URL}/locks`, {
        viewer,
        path: HELD,
        digest: read.digest,
      });
      expect(taken.status).to.equal(200);
    },
  };
}

describe("[unit] mockup MCP writes while another viewer holds a block", () => {
  const viewer = useViewer();
  const workspace = useWorkspace();

  it("refuses mockup_write_spec a change to the held block, naming the holder at the block's path, and leaves the file as it was; a change elsewhere lands (fails when the tool writes over a held block)", async () => {
    await viewer.hold(held());
    const before = await workspace.specBytes();

    const refused = await answer(
      write,
      { mockup: NAME, spec: await rewritten(workspace, HELD) },
      writeAnswerSchema,
    );

    expect(refused).to.deep.equal({
      ok: false,
      errors: [{ path: HELD, message: MESSAGE }],
      warnings: [],
    });
    expect(await workspace.specBytes()).to.equal(before);

    const landed = await answer(
      write,
      { mockup: NAME, spec: await rewritten(workspace, OTHER) },
      writeAnswerSchema,
    );

    expect(landed.ok).to.equal(true);
    expect(await htmlAt(workspace, OTHER)).to.equal("<p>changed</p>");
    expect(await htmlAt(workspace, HELD)).to.equal("<p>held</p>");
  });

  it("refuses mockup_write_spec a write that removes the held block (fails when only a change of the block is refused)", async () => {
    await viewer.hold(held());
    const before = await workspace.specBytes();
    const next = await rewritten(workspace, OTHER);
    const tree = specValueAt(next, "/pages/0/tree");
    if (!Array.isArray(tree)) throw new Error("the spec has no tree");
    tree.shift();

    const refused = await answer(
      write,
      { mockup: NAME, spec: next },
      writeAnswerSchema,
    );

    expect(refused.errors).to.deep.equal([{ path: HELD, message: MESSAGE }]);
    expect(await workspace.specBytes()).to.equal(before);
  });

  it("refuses mockup_patch_spec a change to the held block, naming the holder, and leaves the file as it was; a change elsewhere lands (fails when the patch tool writes over a held block)", async () => {
    await viewer.hold(held());
    const before = await workspace.specBytes();

    const refused = await answer(patch, replaceHtml(HELD), writeAnswerSchema);

    expect(refused).to.deep.equal({
      ok: false,
      errors: [{ path: HELD, message: MESSAGE }],
      warnings: [],
    });
    expect(await workspace.specBytes()).to.equal(before);

    const landed = await answer(patch, replaceHtml(OTHER), writeAnswerSchema);

    expect(landed.ok).to.equal(true);
    expect(await htmlAt(workspace, OTHER)).to.equal("<p>changed</p>");
  });

  it("refuses mockup_from_page a replace that changes the held block, naming the holder, and leaves the file as it was (fails when the conversion is not asked about the locks)", async () => {
    await viewer.hold(livePage());
    const before = await workspace.specBytes();

    const refused = await run(fromPage, {
      pageRef: REF,
      replace: true,
      into: NAME,
    });

    expect(refused.isError).to.equal(true);
    expect(JSON.parse(refused.text)).to.deep.include({
      ok: false,
      error: "conflict",
      errors: [{ path: HELD, message: MESSAGE }],
    });
    expect(await workspace.specBytes()).to.equal(before);
  });
});

describe("[unit] mockup MCP writes while no mockup engine runs", () => {
  const workspace = useWorkspace();

  it("lands as before, the locks being a matter of the dev engine (fails when a missing engine refuses every write)", async () => {
    expect(
      await write.call({ mockup: NAME, spec: held() }),
    ).to.not.have.property("isError", true);

    const landed = await answer(
      write,
      { mockup: NAME, spec: spec(sketch("<p>b</p>")) },
      writeAnswerSchema,
    );

    expect(landed.ok).to.equal(true);
    expect(await htmlAt(workspace, HELD)).to.equal("<p>b</p>");
  });
});
