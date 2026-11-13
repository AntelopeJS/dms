import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import {
  createAnnotation,
  MOCKUP_SOURCES,
  mockupNameSchema,
  MockupStore,
  specSchema,
  updateAnnotation,
} from "../../../mockup";

const NAME = mockupNameSchema.parse("desk");

function specObject(title: string) {
  return {
    version: 1,
    pages: [
      {
        id: "home",
        title,
        tree: [{ type: "KpiCard", options: { title, staticValue: 1 } }],
      },
    ],
  };
}

function spec(title: string): string {
  return JSON.stringify(specObject(title));
}

let root: string;
let store: MockupStore;

/** One mockup, `desk`, in a fresh mockups directory for each test. */
function withMockupsDirectory(): void {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dms-mockups-"));
    await mkdir(join(root, NAME));
    await writeFile(join(root, NAME, "spec.json"), spec("First"));
    store = new MockupStore(root);
  });

  afterEach(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
}

describe("[unit] mockup list order and comments", () => {
  withMockupsDirectory();

  it("lists the mockup changed last first, and by name when changed together", async () => {
    const at = (iso: string) => new Date(iso);
    const write = async (name: string, changed: Date) => {
      await mkdir(join(root, name), { recursive: true });
      const file = join(root, name, "spec.json");
      await writeFile(file, spec(name));
      await utimes(file, changed, changed);
    };
    await write("old", at("2026-01-01T00:00:00Z"));
    await write("new", at("2026-03-01T00:00:00Z"));
    await write("tie-b", at("2026-02-01T00:00:00Z"));
    await write("tie-a", at("2026-02-01T00:00:00Z"));
    await utimes(
      join(root, NAME, "spec.json"),
      at("2025-12-01T00:00:00Z"),
      at("2025-12-01T00:00:00Z"),
    );

    const listed = await store.list();

    expect(listed.map((summary) => summary.name)).to.deep.equal([
      "new",
      "tie-a",
      "tie-b",
      "old",
      NAME,
    ]);
    expect(listed[0].updatedAt).to.equal("2026-03-01T00:00:00.000Z");
  });

  it("counts the open annotations of a mockup, never the resolved ones", async () => {
    const draft = { page: "home", path: "/pages/0/tree/0" };
    const first = await createAnnotation(NAME, { ...draft, text: "a" }, root);
    if (first.kind !== "created") throw new Error(`not created: ${first.kind}`);
    await createAnnotation(NAME, { ...draft, text: "b" }, root);
    await createAnnotation(NAME, { ...draft, text: "c" }, root);
    await updateAnnotation(
      NAME,
      first.annotation.id,
      { status: "resolved" },
      root,
    );
    await mkdir(join(root, "quiet"));
    await writeFile(join(root, "quiet", "spec.json"), spec("Quiet"));

    const counts = Object.fromEntries(
      (await store.list()).map((summary) => [
        summary.name,
        summary.openComments,
      ]),
    );

    expect(counts).to.deep.equal({ [NAME]: 2, quiet: 0 });
  });

  it("still lists a mockup whose annotations file is not readable", async () => {
    await writeFile(join(root, NAME, "annotations.json"), "{ not json");

    const listed = await store.list();

    expect(listed).to.have.length(1);
    expect(listed[0].openComments).to.equal(0);
  });

  /**
   * Fails a store that keeps a blank title (an unlabelled link on the card),
   * or a spec reader that refuses a build time with a UTC offset, which the
   * JSON Schema's `date-time` allows.
   */
});

describe("[unit] mockup list status and source", () => {
  withMockupsDirectory();

  it("lists the source and the built pages a spec writes, a page titled by its path when its title is absent or blank", async () => {
    await writeFile(
      join(root, NAME, "spec.json"),
      JSON.stringify({
        ...specObject("Built"),
        source: "claude-code",
        built: {
          at: "2026-11-13T12:00:00+02:00",
          pages: [
            { path: "/orders", title: "Orders" },
            { path: "/orders/new" },
            { path: "/stock", title: "   " },
          ],
        },
      }),
    );

    const [summary] = await store.list();

    expect(summary).to.not.have.property("title");
    expect(summary).to.deep.include({
      name: NAME,
      source: "claude-code",
      status: "built",
      builtAt: "2026-11-13T12:00:00+02:00",
    });
    expect(summary).to.have.deep.property("builtPages", [
      { path: "/orders", title: "Orders" },
      { path: "/orders/new", title: "/orders/new" },
      { path: "/stock", title: "/stock" },
    ]);
  });

  it("lists a spec as a draft when its built or its source is invalid, keeping what reads cleanly", async () => {
    const bad = [
      { path: "//evil.com" },
      { path: "/\\evil.com" },
      { path: "javascript:alert(1)" },
      { path: "/has space" },
      { path: "https://evil.com/x" },
    ];
    const names: string[] = [];
    for (const [index, page] of bad.entries()) {
      const name = `bad-${index}`;
      names.push(name);
      await mkdir(join(root, name));
      await writeFile(
        join(root, name, "spec.json"),
        JSON.stringify({
          ...specObject("Bad"),
          source: "somebody",
          built: { at: "2026-11-13T10:00:00Z", pages: [page] },
        }),
      );
    }

    const listed = (await store.list()).filter((summary) =>
      names.includes(summary.name),
    );

    expect(listed).to.have.length(bad.length);
    for (const summary of listed) {
      expect(summary).to.deep.include({ status: "draft", pages: 1 });
      expect(summary).to.not.have.property("source");
      expect(summary).to.not.have.property("builtPages");
    }
  });

  it("lists a spec that is not JSON as a draft of no pages", async () => {
    await writeFile(
      join(root, NAME, "spec.json"),
      '{ "version": 1, "pages": [',
    );

    expect(await store.list()).to.have.length(1);
    expect((await store.list())[0]).to.deep.include({
      pages: 0,
      status: "draft",
    });
  });
});

describe("[unit] mockup spec source and built", () => {
  it("refuses, in the spec, a built page whose path is not one of the dashboard", () => {
    const written = (path: string) =>
      specSchema.safeParse({
        ...specObject("Built"),
        built: { at: "2026-11-13T10:00:00Z", pages: [{ path }] },
      }).success;

    expect(written("//evil.com")).to.equal(false);
    expect(written("/\\evil.com")).to.equal(false);
    expect(written("javascript:x")).to.equal(false);
    expect(written("https://evil.com")).to.equal(false);
    expect(written("/a b")).to.equal(false);
    expect(written("")).to.equal(false);
    expect(written("/orders?tab=open#top")).to.equal(true);
    expect(
      specSchema.safeParse({
        ...specObject("Built"),
        built: { at: "2026-11-13T10:00:00Z", pages: [] },
      }).success,
    ).to.equal(false);
    expect(
      specSchema.safeParse({
        ...specObject("Built"),
        built: { at: "yesterday", pages: [{ path: "/a" }] },
      }).success,
    ).to.equal(false);
  });

  it("accepts the source and the built a spec writes, and refuses a source nobody is", () => {
    const base = specObject("Built");

    for (const source of MOCKUP_SOURCES) {
      expect(specSchema.safeParse({ ...base, source }).success).to.equal(true);
    }
    expect(
      specSchema.safeParse({ ...base, source: "gemini" }).success,
    ).to.equal(false);
  });
});
