import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";
import { z } from "zod";
import {
  buildMockupSchema,
  compileSpec,
  type Json,
  type JsonObject,
  mockupNameSchema,
  MockupStore,
  parseSpec,
} from "../../../mockup";

const DEMO = mockupNameSchema.parse("demo");

function specWith(modules?: Json): JsonObject {
  return {
    version: 1,
    ...(modules !== undefined && { modules }),
    pages: [{ id: "home", title: "Home", tree: [] }],
  };
}

function issuesOf(spec: JsonObject): Array<{ path: string; message: string }> {
  const read = parseSpec(JSON.stringify(spec));
  return read.ok ? [] : read.issues;
}

function compiled(spec: JsonObject) {
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

const schemaSchema = z.object({
  properties: z.object({
    modules: z.object({
      type: z.literal("array"),
      uniqueItems: z.literal(true),
      description: z.string(),
      items: z.object({ enum: z.array(z.string()) }),
    }),
  }),
});

describe("[unit] mockup modules", () => {
  it("compiles the listed modules with the id, package and icon of their catalog entry, in the spec's order (fails when the state keeps bare ids or reorders them)", () => {
    const { modules, issues } = compiled(specWith(["media", "mailing"]));

    expect(issues).to.deep.equal([]);
    expect(modules).to.deep.equal([
      {
        id: "media",
        package: "@antelopejs/dms-media",
        icon: "i-ph-images",
      },
      {
        id: "mailing",
        package: "@antelopejs/dms-mailing",
        icon: "i-ph-envelope-simple",
      },
    ]);
  });

  it("leaves the state without modules when the spec lists none or an empty list (fails when every mockup gets an empty list)", () => {
    expect(compiled(specWith()).modules).to.equal(undefined);
    expect(compiled(specWith([])).modules).to.equal(undefined);
  });

  it("refuses an id the catalog lacks at its index, naming it and the known ids (fails when any string is accepted)", () => {
    const issues = issuesOf(specWith(["mailing", "billing"]));

    expect(issues.map((issue) => issue.path)).to.deep.equal(["/modules/1"]);
    expect(issues[0]?.message).to.contain('"billing"');
    expect(issues[0]?.message).to.contain(
      "ai, api, automation, database, lang, mailing, marketing, media, saas",
    );
  });

  it("refuses an id listed twice at its second index only, and not as an unknown id (fails when duplicates pass or the first one is flagged)", () => {
    const issues = issuesOf(specWith(["saas", "media", "saas"]));

    expect(issues.map((issue) => issue.path)).to.deep.equal(["/modules/2"]);
    expect(issues[0]?.message).to.contain("already listed");
    expect(issues[0]?.message).not.to.contain("no module");
  });

  it("refuses a module that is not a string (fails when ids are coerced)", () => {
    expect(issuesOf(specWith([3])).map((issue) => issue.path)).to.deep.equal([
      "/modules/0",
    ]);
    expect(
      issuesOf(specWith("mailing")).map((issue) => issue.path),
    ).to.deep.equal(["/modules"]);
  });

  it("describes the modules in the JSON Schema: unique, an enum of the catalog ids, and what building does with them", () => {
    const schema = schemaSchema.parse(buildMockupSchema(ListBlockTypes()));
    const { modules } = schema.properties;

    expect(modules.items.enum).to.include.members(["mailing", "media", "saas"]);
    expect(modules.items.enum).to.not.include("billing");
    expect(modules.description).to.contain("ajs project modules add");
  });

  describe("in the store", () => {
    let root: string;
    let store: MockupStore;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), "dms-mockups-"));
      await mkdir(join(root, DEMO));
      await writeFile(
        join(root, DEMO, "spec.json"),
        JSON.stringify(specWith(["mailing"])),
      );
      store = new MockupStore(root);
    });

    afterEach(async () => {
      store.close();
      await rm(root, { recursive: true, force: true });
    });

    it("hands the modules to the viewer, and keeps them while spec.json is unreadable (fails when the viewer's state has no modules)", async () => {
      const good = await store.state(DEMO);
      await writeFile(join(root, DEMO, "spec.json"), '{ "version": 1, ');
      const broken = await store.state(DEMO);

      expect(good?.modules?.map((entry) => entry.id)).to.deep.equal([
        "mailing",
      ]);
      expect(broken?.modules).to.deep.equal(good?.modules);
    });

    it("drops the modules from the state once the spec lists none (fails when a stale list stays)", async () => {
      await store.state(DEMO);
      await writeFile(
        join(root, DEMO, "spec.json"),
        JSON.stringify(specWith()),
      );

      expect((await store.state(DEMO))?.modules).to.equal(undefined);
    });
  });
});
