import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PageDraft } from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import {
  applyMockupToPage,
  editPageAsMockup,
  type LivePageWriter,
  type MockupNode,
  mockupNameSchema,
  specSchema,
} from "../../../mockup";
import { judgedWriter } from "../../../mcp/tools";
import {
  type BlockDraft,
  stubPages,
  structureOf,
} from "../../helpers/live-page";
import {
  CONNECT_CHECK,
  createShop,
  destroyShop,
  OP_TIMEOUT,
} from "./helpers/block-requests";

const NAME = mockupNameSchema.parse("books");

type NodeOptions = NonNullable<MockupNode["options"]>;
const CONVERTED = "0123456789abcdef";
const AUTHORED = "/api/mailing/send";

const BLOCKS: BlockDraft[] = [
  {
    name: "revenue",
    type: "KpiCard",
    config: { title: "Revenue", fetchUrl: "/api/books/revenue" },
  },
  {
    name: "invite",
    type: "Form",
    config: { title: "Invite", submitUrl: AUTHORED },
  },
];

/** The live `/books` page under {@link BLOCKS}, its drafts recorded, behind the check. */
function judgedBuilder() {
  const pages = stubPages([structureOf("/books", BLOCKS, CONVERTED)]);
  const drafts: PageDraft[] = [];
  const base: LivePageWriter = {
    ...pages,
    setPageBlocks: (_ref, draft) => {
      drafts.push(draft);
      return Promise.resolve({
        ok: true,
        data: { version: "1111111111111111" },
        changes: [],
      });
    },
  };
  return { writer: judgedWriter(base), drafts };
}

describe("[unit] mockup_apply_to_page writes no block that sends requests outside its page's data API", function () {
  this.timeout(OP_TIMEOUT);
  let dir = "";
  const specFile = () => join(dir, "books", "spec.json");

  before(createShop);
  after(destroyShop);
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "dms-apply-requests-"));
    await editPageAsMockup(
      dir,
      { pageRef: "/books" },
      {},
      stubPages([structureOf("/books", BLOCKS, CONVERTED)]),
    );
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  /** Rewrites the options of the spec's node `id` with `edit`. */
  async function editOptions(
    id: string,
    edit: (options: NodeOptions) => NodeOptions,
  ): Promise<void> {
    const spec = specSchema.parse(
      JSON.parse(await readFile(specFile(), "utf8")),
    );
    const node = spec.pages[0].tree.find((candidate) => candidate.id === id);
    if (!node) throw new Error(`the spec has no node ${id}`);
    node.options = edit({ ...node.options });
    await writeFile(specFile(), `${JSON.stringify(spec, null, 2)}\n`);
  }

  it("refuses a mockup whose KPI now posts to the assistant's database connect check, and writes nothing", async () => {
    await editOptions("revenue", (options) => ({
      ...options,
      fetchUrl: CONNECT_CHECK,
      fetchUrlMethod: "POST",
    }));
    const { writer, drafts } = judgedBuilder();

    const answer = await applyMockupToPage(dir, NAME, "books", writer);

    expect(answer.ok).to.equal(false);
    expect(JSON.stringify(answer)).to.include("/blocks/0/config/fetchUrl");
    expect(drafts).to.deep.equal([]);
  });

  it("writes a mockup that retitles a form its author pointed elsewhere, leaving that URL as it was", async () => {
    await editOptions("invite", (options) => ({ ...options, title: "Send" }));
    const { writer, drafts } = judgedBuilder();

    const answer = await applyMockupToPage(dir, NAME, "books", writer);

    expect(answer.ok, JSON.stringify(answer)).to.equal(true);
    expect(JSON.stringify(drafts)).to.include(AUTHORED);
  });
});
