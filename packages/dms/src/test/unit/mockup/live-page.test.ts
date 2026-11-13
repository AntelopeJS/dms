import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import {
  type EditAsMockupAnswer,
  editPageAsMockup,
  type LivePages,
  type LivePageTarget,
  readSpecSource,
  mockupNameSchema,
  resolvePageRef,
  specSchema,
} from "../../../mockup";
import {
  type BlockDraft,
  stubPages,
  structureOf,
} from "../../helpers/live-page";

const BLOCKS: BlockDraft[] = [
  {
    name: "revenue",
    type: "KpiCard",
    config: { title: "Revenue", fetchUrl: "/api/books/revenue" },
  },
  { name: "custom", type: null },
];

const HAND_MADE = {
  version: 1,
  pages: [{ id: "home", title: "Home", tree: [] }],
};

describe("[unit] mockup of a live page, opened twice", () => {
  let mockupsDir = "";

  beforeEach(async () => {
    mockupsDir = await mkdtemp(join(tmpdir(), "dms-live-page-"));
  });

  afterEach(() => rm(mockupsDir, { recursive: true, force: true }));

  const specText = (name: string) =>
    readFile(join(mockupsDir, name, "spec.json"), "utf8");

  async function specOf(name: string) {
    return specSchema.parse(JSON.parse(await specText(name)));
  }

  function open(
    target: LivePageTarget,
    pages: LivePages = stubPages([structureOf("/books", BLOCKS)]),
    options: Parameters<typeof editPageAsMockup>[2] = {},
  ): Promise<EditAsMockupAnswer> {
    return editPageAsMockup(mockupsDir, target, options, pages);
  }

  it("creates mockups/<page>/spec.json linked to the page, and answers where to edit it", async () => {
    const answer = await open({ pageRef: "/books" });
    const spec = await specOf("books");

    expect(answer).to.deep.equal({
      ok: true,
      outcome: "created",
      mockup: "books",
      page: "books",
      url: "/mockup?name=books&page=books&mode=edit",
      sketches: [{ path: "/books#custom", reason: "custom-component" }],
      liveRoutes: ["api-books-revenue"],
    });
    expect(spec.title).to.equal("Page /books");
    expect(spec.pages.map((page) => page.livePage)).to.deep.equal([
      { ref: "/books", version: "0123456789abcdef" },
    ]);
  });

  it("reopens the same mockup on a second click and writes nothing", async () => {
    await open({ pageRef: "/books" });
    const before = await specText("books");

    const answer = await open({ pageRef: "/books" });

    expect(answer).to.deep.include({
      ok: true,
      outcome: "reopened",
      stale: false,
      mockup: "books",
    });
    expect(await specText("books")).to.equal(before);
  });

  it("says the mockup is stale when the page changed since, and still writes nothing", async () => {
    await open({ pageRef: "/books" });
    const before = await specText("books");
    const changed = stubPages([
      structureOf("/books", BLOCKS, "fedcba9876543210"),
    ]);

    const answer = await open({ pageRef: "/books" }, changed);

    expect(answer).to.deep.include({
      ok: true,
      outcome: "reopened",
      stale: true,
    });
    expect(await specText("books")).to.equal(before);
  });

  it("converts again over the page alone on replace, keeping the spec's other pages", async () => {
    await open({ pageRef: "/books" });
    const name = mockupNameSchema.parse("books");
    const spec = await specOf("books");
    await writeFile(
      join(mockupsDir, "books", "spec.json"),
      JSON.stringify({
        ...spec,
        pages: [...spec.pages, { id: "extra", title: "Extra", tree: [] }],
      }),
    );
    const read = await readSpecSource(mockupsDir, name);
    const changed = stubPages([
      structureOf("/books", BLOCKS, "fedcba9876543210"),
    ]);

    const answer = await open({ pageRef: "/books" }, changed, {
      replace: true,
      digest: read?.digest,
    });
    const replaced = await specOf("books");

    expect(answer).to.deep.include({ ok: true, outcome: "replaced" });
    expect(replaced.pages.map((page) => page.id)).to.deep.equal([
      "books",
      "extra",
    ]);
    expect(replaced.pages[0]?.livePage?.version).to.equal("fedcba9876543210");
  });

  it("refuses a replace over a spec that changed since its digest was read", async () => {
    await open({ pageRef: "/books" });
    const before = await specText("books");

    const answer = await open({ pageRef: "/books" }, undefined, {
      replace: true,
      digest: "0000000000000000",
    });

    expect(answer).to.deep.include({ ok: false, error: "conflict" });
    expect(await specText("books")).to.equal(before);
  });

  it("refuses a replace when the editor saves the spec while the page converts, keeping that save", async () => {
    const withTable: BlockDraft[] = [
      ...BLOCKS,
      { name: "books", type: "TableView", controller: "book" },
    ];
    await open(
      { pageRef: "/books" },
      stubPages([structureOf("/books", withTable)]),
    );
    const name = mockupNameSchema.parse("books");
    const read = await readSpecSource(mockupsDir, name);
    const saved = JSON.stringify({
      ...(await specOf("books")),
      title: "Saved",
    });
    const pages = stubPages([
      structureOf("/books", withTable, "fedcba9876543210"),
    ]);
    const savingPages: LivePages = {
      ...pages,
      resourceStructure: async (ref) => {
        await writeFile(join(mockupsDir, "books", "spec.json"), saved);
        return pages.resourceStructure(ref);
      },
    };

    const answer = await open({ pageRef: "/books" }, savingPages, {
      replace: true,
      digest: read?.digest,
    });

    expect(answer).to.deep.include({ ok: false, error: "conflict" });
    expect(await specText("books")).to.equal(saved);
  });

  it("refuses to write over a mockup another writer creates under the free name while the page converts", async () => {
    const withTable: BlockDraft[] = [
      ...BLOCKS,
      { name: "books", type: "TableView", controller: "book" },
    ];
    const handMade = JSON.stringify(HAND_MADE);
    const pages = stubPages([structureOf("/books", withTable)]);
    const creatingPages: LivePages = {
      ...pages,
      resourceStructure: async (ref) => {
        await mkdir(join(mockupsDir, "books"), { recursive: true });
        await writeFile(join(mockupsDir, "books", "spec.json"), handMade);
        return pages.resourceStructure(ref);
      },
    };

    const answer = await open({ pageRef: "/books" }, creatingPages);

    expect(answer).to.deep.include({ ok: false, error: "conflict" });
    expect(await specText("books")).to.equal(handMade);
  });

  describe("after a hand edit that breaks the schema", () => {
    const name = mockupNameSchema.parse("books");

    async function breakSpec(): Promise<string> {
      await open({ pageRef: "/books" });
      const spec = await specOf("books");
      const unknownKey = {
        type: "KpiCard",
        options: { title: "Extra" },
        note: "work in progress",
      };
      await writeFile(
        join(mockupsDir, "books", "spec.json"),
        JSON.stringify({
          ...spec,
          pages: spec.pages.map((page) => ({
            ...page,
            tree: [...page.tree, unknownKey],
          })),
        }),
      );
      return specText("books");
    }

    it("reopens the mockup the page is linked to, never a <name>-2 beside it", async () => {
      const broken = await breakSpec();
      expect(specSchema.safeParse(JSON.parse(broken)).success).to.equal(false);

      const answer = await open({ pageRef: "/books" });

      expect(answer).to.deep.include({
        ok: true,
        outcome: "reopened",
        mockup: "books",
        page: "books",
        stale: false,
        digest: (await readSpecSource(mockupsDir, name))?.digest,
      });
      expect(await readdir(mockupsDir)).to.deep.equal(["books"]);
      expect(await specText("books")).to.equal(broken);
    });

    it("still says the page changed, from the version the file records", async () => {
      await breakSpec();
      const changed = stubPages([
        structureOf("/books", BLOCKS, "fedcba9876543210"),
      ]);

      const answer = await open({ pageRef: "/books" }, changed);

      expect(answer).to.deep.include({ outcome: "reopened", stale: true });
    });

    it("refuses a replace with invalid, writing nothing, so the hand edit is not lost", async () => {
      const broken = await breakSpec();
      const read = await readSpecSource(mockupsDir, name);

      const answer = await open({ pageRef: "/books" }, undefined, {
        replace: true,
        digest: read?.digest,
      });

      expect(answer).to.deep.include({ ok: false, error: "invalid" });
      expect(await readdir(mockupsDir)).to.deep.equal(["books"]);
      expect(await specText("books")).to.equal(broken);
    });
  });

  it("never takes a hand-made mockup of that name: it creates <name>-2 and leaves the other alone", async () => {
    await mkdir(join(mockupsDir, "books"));
    await writeFile(
      join(mockupsDir, "books", "spec.json"),
      JSON.stringify(HAND_MADE),
    );

    const first = await open({ pageRef: "/books" });
    const second = await open({ pageRef: "/books" });

    expect(first).to.deep.include({ outcome: "created", mockup: "books-2" });
    expect(second).to.deep.include({ outcome: "reopened", mockup: "books-2" });
    expect(JSON.parse(await specText("books"))).to.deep.equal(HAND_MADE);
  });

  it("gives two pages whose routes slug alike two mockups", async () => {
    const pages = stubPages([structureOf("/a-b", []), structureOf("/a/b", [])]);

    const first = await open({ pageRef: "/a-b" }, pages);
    const second = await open({ pageRef: "/a/b" }, pages);

    expect(
      [first, second].map((answer) => answer.ok && answer.mockup),
    ).to.deep.equal(["a-b", "a-b-2"]);
  });

  describe("when two pages are converted at once", () => {
    it("keeps both mockups: the pages that slug alike end up under two names", async () => {
      const pages = stubPages([
        structureOf("/a-b", []),
        structureOf("/a/b", []),
      ]);

      const answers = await Promise.all([
        open({ pageRef: "/a-b" }, pages),
        open({ pageRef: "/a/b" }, pages),
      ]);

      expect(
        answers.map((answer) => answer.ok && [answer.outcome, answer.mockup]),
      ).to.deep.equal([
        ["created", "a-b"],
        ["created", "a-b-2"],
      ]);
      expect((await specOf("a-b")).pages[0]?.livePage?.ref).to.equal("/a-b");
      expect((await specOf("a-b-2")).pages[0]?.livePage?.ref).to.equal("/a/b");
    });

    it("runs the next conversion after one that failed", async () => {
      const working = stubPages([structureOf("/books", BLOCKS)]);
      const failing: LivePages = {
        ...working,
        pageStructure: () => Promise.reject(new Error("the builder is down")),
      };

      const [first, second] = await Promise.allSettled([
        open({ pageRef: "/books" }, failing),
        open({ pageRef: "/books" }, working),
      ]);

      expect(first.status).to.equal("rejected");
      expect(second.status === "fulfilled" && second.value).to.deep.include({
        ok: true,
        outcome: "created",
      });
    });
  });

  it("finds the page a dashboard path shows, a page with parameters included", async () => {
    const pages = stubPages([structureOf("/customers/:id", [])]);

    const answer = await open({ path: "/customers/42" }, pages);

    expect(answer).to.deep.include({
      ok: true,
      outcome: "created",
      mockup: "customers-id",
    });
  });

  it("answers not_found and writes nothing for a path no page answers", async () => {
    const answer = await open({ path: "/nowhere" });

    expect(answer).to.deep.include({ ok: false, error: "not_found" });
    expect(
      await readSpecSource(mockupsDir, mockupNameSchema.parse("nowhere")),
    ).to.equal(undefined);
  });
});

describe("[unit] the page a dashboard path shows", () => {
  const pages = [
    { ref: "/projects/:id" },
    { ref: "/projects/new" },
    { ref: "/" },
  ];

  it("prefers the page whose ref is the path over a page with parameters", () => {
    expect(resolvePageRef("/projects/new", pages)).to.equal("/projects/new");
    expect(resolvePageRef("/projects/7/", pages)).to.equal("/projects/:id");
    expect(resolvePageRef("/", pages)).to.equal("/");
  });

  it("matches a parameter against one non-empty segment, never more", () => {
    expect(resolvePageRef("/projects/7/edit", pages)).to.equal(undefined);
    expect(resolvePageRef("/projects", pages)).to.equal(undefined);
  });
});
