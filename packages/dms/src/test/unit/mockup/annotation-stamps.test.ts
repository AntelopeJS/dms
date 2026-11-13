import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import {
  createAnnotation,
  defaultMockupsDir,
  listAnnotations,
} from "../../../mockup";
import {
  annotate,
  edit,
  expectBlockAt,
  MOCKUP,
  put,
  served,
  STAMPED_ID,
} from "../../helpers/mockup-anchors";
import { NAME, sketch, spec, useWorkspace } from "../../helpers/mockup-mcp";

const CONCURRENT_NOTES = 20;

const stampedSpecSchema = z.object({
  pages: z.array(
    z.object({ tree: z.array(z.object({ id: z.string().optional() })) }),
  ),
});

function specPath(): string {
  return join(defaultMockupsDir(), NAME, "spec.json");
}

function annotationsPath(): string {
  return join(defaultMockupsDir(), NAME, "annotations.json");
}

/** A spec with `node` whose page keys are out of the order a fresh spec has. */
function unordered(node: JsonValue): JsonValue {
  return { version: 1, pages: [{ title: "Home", id: "home", tree: [node] }] };
}

const LAYOUTS: ReadonlyArray<[string, (spec: JsonValue) => string]> = [
  ["four-space indentation", (value) => `${JSON.stringify(value, null, 4)}\n`],
  ["one line", (value) => `${JSON.stringify(value)}\n`],
  [
    "CRLF line endings",
    (value) => `${JSON.stringify(value, null, 2).replaceAll("\n", "\r\n")}\r\n`,
  ],
  [
    "tabs and no final line ending",
    (value) => JSON.stringify(value, null, "\t"),
  ],
];

describe("[unit] mockup annotation stamps: spec.json", () => {
  const workspace = useWorkspace();

  for (const [layout, laidOut] of LAYOUTS) {
    it(`stamps the id on the node alone in a file with ${layout}, keeping its key order and its layout (fails when the stamp writes the file in another layout)`, async () => {
      const node = {
        options: { height: 120, html: "<p>a</p>" },
        type: "sketch",
      };
      await put(sketch("<p>a</p>"));
      await writeFile(specPath(), laidOut(unordered(node)));

      const { anchor } = await annotate("home", "/pages/0/tree/0");
      const id = anchor?.block ?? "";

      expect(id).to.match(STAMPED_ID);
      expect(await workspace.specBytes()).to.equal(
        laidOut(unordered({ ...node, id })),
      );
    });
  }

  it("anchors a note on a block of a spec that has issues, and leaves those issues as they were (fails when the stamp goes through the checked writer)", async () => {
    await put(sketch("<p>a</p>"));
    await writeFile(
      specPath(),
      JSON.stringify(
        spec(sketch("<p>a</p>"), { type: "NoSuchBlock", options: {} }),
      ),
    );

    const { id } = await annotate("home", "/pages/0/tree/1");
    const note = await served(id);
    const after = await workspace.specBytes();

    expect(note.anchor?.block).to.match(STAMPED_ID);
    expect(note.path).to.equal("/pages/0/tree/1");
    expect(after).to.contain("NoSuchBlock");
    expect(after).to.contain(note.anchor?.block);
  });

  it("answers why when the spec does not parse, and stamps nothing (fails when the note is created on a spec that cannot take an id)", async () => {
    await put(sketch("<p>a</p>"));
    await writeFile(specPath(), "{ not json");

    const created = await createAnnotation(
      MOCKUP,
      { page: "home", path: "/pages/0/tree/0", text: "x" },
      defaultMockupsDir(),
    );

    expect(created.kind).to.equal("spec_invalid");
    expect(await workspace.specBytes()).to.equal("{ not json");
    expect(await listAnnotations(MOCKUP, defaultMockupsDir())).to.deep.equal(
      [],
    );
  });

  it("keeps every note of concurrent creates, all anchored on the one id stamped (fails when a stamp is written outside the spec lock)", async () => {
    await put(sketch("<p>a</p>"), sketch("<p>b</p>"));
    const pathOf = (index: number) => `/pages/0/tree/${index % 2}`;

    const created = await Promise.all(
      Array.from({ length: CONCURRENT_NOTES }, (_, index) =>
        annotate("home", pathOf(index), `note ${index}`),
      ),
    );
    const notes = (await listAnnotations(MOCKUP, defaultMockupsDir())) ?? [];
    const sorted = (paths: string[]) =>
      paths.sort((left, right) => left.localeCompare(right));

    expect(new Set(notes.map((note) => note.id))).to.deep.equal(
      new Set(created.map((note) => note.id)),
    );
    expect(sorted(notes.flatMap((note) => note.path ?? []))).to.deep.equal(
      sorted(
        Array.from({ length: CONCURRENT_NOTES }, (_, index) => pathOf(index)),
      ),
    );
    expect(new Set(notes.map((note) => note.anchor?.block)).size).to.equal(2);
  });
});

describe("[unit] mockup annotation stamps: version 1 migration", () => {
  const workspace = useWorkspace();

  function legacyNote(id: string, path: string) {
    return {
      id,
      page: "home",
      path,
      text: id,
      status: "open",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("migrates a version 1 file by stamping ids, and the notes then follow their blocks (fails when notes keep their pointers or are dropped)", async () => {
    await put(sketch("<p>a</p>"), sketch("<p>b</p>"));
    await writeFile(
      annotationsPath(),
      JSON.stringify({
        version: 1,
        annotations: ["one", "two"].map((id) =>
          legacyNote(id, "/pages/0/tree/1"),
        ),
      }),
    );

    const migrated = await listAnnotations(MOCKUP, defaultMockupsDir());
    const stamped = await workspace.specBytes();
    const [first, second] = stampedSpecSchema.parse(JSON.parse(stamped))
      .pages[0].tree;
    const again = await listAnnotations(MOCKUP, defaultMockupsDir());
    await edit({
      op: "add",
      path: "/pages/0/tree/0",
      value: sketch("<p>new</p>"),
    });

    expect(migrated?.map(({ page, path }) => ({ page, path }))).to.deep.equal([
      { page: "home", path: "/pages/0/tree/1" },
      { page: "home", path: "/pages/0/tree/1" },
    ]);
    expect(second.id).to.match(STAMPED_ID);
    expect(first).to.not.have.property("id");
    expect(again).to.deep.equal(migrated);
    expect(await workspace.specBytes()).to.not.equal(stamped);
    await expectBlockAt("one", "/pages/0/tree/2", "html", "<p>b</p>");
    await expectBlockAt("two", "/pages/0/tree/2", "html", "<p>b</p>");
  });

  it("migrates a version 1 note whose pointer names no node into a note with no location (fails when it is dropped or anchored elsewhere)", async () => {
    await put(sketch("<p>a</p>"));
    await writeFile(
      annotationsPath(),
      JSON.stringify({
        version: 1,
        annotations: [legacyNote("ghost", "/pages/0/tree/7")],
      }),
    );

    const [ghost] = (await listAnnotations(MOCKUP, defaultMockupsDir())) ?? [];

    expect(ghost).to.include({ id: "ghost", text: "ghost" });
    expect(ghost).to.not.have.property("path");
    expect(ghost).to.not.have.property("anchor");
  });
});
