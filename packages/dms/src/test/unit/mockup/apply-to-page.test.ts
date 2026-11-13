import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  MutationOpts,
  OpResult,
  PageDraft,
  PageStructure,
} from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import {
  applyMockupToPage,
  editPageAsMockup,
  type LivePageWriter,
  mockupNameSchema,
  specSchema,
} from "../../../mockup";
import {
  type BlockDraft,
  stubPages,
  structureOf,
} from "../../helpers/live-page";

const NAME = mockupNameSchema.parse("books");
const CONVERTED = "0123456789abcdef";
const MOVED = "fedcba9876543210";
const WRITTEN = "1111111111111111";

const BLOCKS: BlockDraft[] = [
  {
    name: "revenue",
    type: "KpiCard",
    config: { title: "Revenue", fetchUrl: "/api/books/revenue" },
  },
  { name: "custom", type: null },
];

type Write = { ref: string; draft: PageDraft; opts: MutationOpts };

const UNLINKED = JSON.stringify({
  version: 1,
  pages: [{ id: "books", title: "Books", tree: [] }],
});

/** The builder over `structures`, its writes recorded and answered by `answer`. */
function builderOver(
  structures: PageStructure[],
  answer: () => Promise<OpResult<{ version: string }>> = () =>
    Promise.resolve({ ok: true, data: { version: WRITTEN }, changes: [] }),
): LivePageWriter & { writes: Write[]; reads: string[] } {
  const pages = stubPages(structures);
  const writes: Write[] = [];
  return {
    ...pages,
    writes,
    setPageBlocks: (ref, draft, opts) => {
      writes.push({ ref, draft, opts });
      return answer();
    },
  };
}

/** A mockups directory per test holding `books`, converted from `/books` at {@link CONVERTED}. */
function useConvertedMockup() {
  const state = { dir: "" };
  const specFile = () => join(state.dir, "books", "spec.json");

  beforeEach(async () => {
    state.dir = await mkdtemp(join(tmpdir(), "dms-apply-"));
    await editPageAsMockup(
      state.dir,
      { pageRef: "/books" },
      {},
      stubPages([structureOf("/books", BLOCKS, CONVERTED)]),
    );
  });

  afterEach(() => rm(state.dir, { recursive: true, force: true }));

  const specText = () => readFile(specFile(), "utf8");

  return {
    specFile,
    specText,
    apply: (builder: LivePageWriter) =>
      applyMockupToPage(state.dir, NAME, "books", builder),
    /** Retitles the KPI in the spec, and answers the spec's text. */
    async editTitle(title: string): Promise<string> {
      const spec = specSchema.parse(JSON.parse(await specText()));
      const [revenue] = spec.pages[0].tree;
      revenue.options = { ...revenue.options, title };
      const text = `${JSON.stringify(spec, null, 2)}\n`;
      await writeFile(specFile(), text);
      return text;
    },
  };
}

describe("[unit] mockup apply to its live page, written", () => {
  const t = useConvertedMockup();

  it("writes the edited page at the version it was converted from, and records the new version and nothing else (fails an apply that writes unconditionally or leaves the spec stale)", async () => {
    const before = await t.editTitle("Income");
    const builder = builderOver([structureOf("/books", BLOCKS, CONVERTED)]);

    const answer = await t.apply(builder);

    expect(answer).to.deep.equal({
      ok: true,
      outcome: "applied",
      livePage: { ref: "/books", version: WRITTEN },
      stamped: true,
      preserved: ["/books#custom"],
      written: ["/books#revenue"],
      added: [],
      removed: [],
      wiring: [],
    });
    expect(builder.writes).to.deep.equal([
      {
        ref: "/books",
        draft: {
          blocks: [
            {
              name: "revenue",
              type: "KpiCard",
              config: { title: "Income", fetchUrl: "/api/books/revenue" },
            },
            { name: "custom", preserve: true },
          ],
        },
        opts: { expectedVersion: CONVERTED },
      },
    ]);
    expect(await t.specText()).to.equal(before.replace(CONVERTED, WRITTEN));
  });

  it("answers stale and writes nothing when the page changed since the conversion (fails an apply that writes over a newer page)", async () => {
    const before = await t.editTitle("Income");
    const builder = builderOver([structureOf("/books", BLOCKS, MOVED)]);

    const answer = await t.apply(builder);

    expect(answer).to.deep.include({
      ok: false,
      error: "stale",
      livePage: { ref: "/books", version: CONVERTED },
      currentVersion: MOVED,
    });
    expect(builder.writes).to.deep.equal([]);
    expect(await t.specText()).to.equal(before);
  });

  it("answers stale when the write finds the page moved, and records no version (fails an apply that stamps a refused write)", async () => {
    const before = await t.editTitle("Income");
    const builder = builderOver(
      [structureOf("/books", BLOCKS, CONVERTED)],
      () =>
        Promise.resolve({
          ok: false,
          error: { code: "stale", ref: "/books", currentVersion: MOVED },
        }),
    );

    const answer = await t.apply(builder);

    expect(answer).to.deep.include({
      ok: false,
      error: "stale",
      currentVersion: MOVED,
    });
    expect(await t.specText()).to.equal(before);
  });
});

describe("[unit] mockup apply to its live page, refused", () => {
  const t = useConvertedMockup();

  it("answers not_found for a page the builder no longer has, and writes nothing (fails an apply that would create the page)", async () => {
    const builder = builderOver([]);

    const answer = await t.apply(builder);

    expect(answer).to.deep.include({ ok: false, error: "not_found" });
    expect(builder.writes).to.deep.equal([]);
    expect(builder.reads).to.deep.equal(["page /books"]);
  });

  it("answers not_linked for a page converted from no live page (fails an apply that guesses a page)", async () => {
    await writeFile(t.specFile(), UNLINKED);
    const builder = builderOver([structureOf("/books", BLOCKS, CONVERTED)]);

    const answer = await t.apply(builder);

    expect(answer).to.deep.include({ ok: false, error: "not_linked" });
    expect(builder.writes).to.deep.equal([]);
  });

  it("passes on the issues the builder refused the draft with, and records no version (fails an apply that hides why)", async () => {
    const before = await t.editTitle("Income");
    const issue = { pointer: "/blocks/0/config", message: "bad option" };
    const builder = builderOver(
      [structureOf("/books", BLOCKS, CONVERTED)],
      () =>
        Promise.resolve({
          ok: false,
          error: { code: "invalid_config", issues: [issue] },
        }),
    );

    const answer = await t.apply(builder);

    expect(answer).to.deep.include({
      ok: false,
      error: "invalid",
      errors: [{ path: "/blocks/0/config", message: "bad option" }],
    });
    expect(await t.specText()).to.equal(before);
  });

  it("writes the page but records no version when the spec page stopped naming it during the write, and says so (fails an apply that stamps another page)", async () => {
    await t.editTitle("Income");
    const builder = builderOver(
      [structureOf("/books", BLOCKS, CONVERTED)],
      async () => {
        await writeFile(t.specFile(), UNLINKED);
        return { ok: true, data: { version: WRITTEN }, changes: [] };
      },
    );

    const answer = await t.apply(builder);

    expect(answer).to.deep.include({ ok: true, stamped: false });
    expect(await t.specText()).to.not.contain(WRITTEN);
  });
});
