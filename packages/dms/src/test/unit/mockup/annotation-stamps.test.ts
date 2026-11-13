import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import {
  createAnnotation,
  defaultMockupsDir,
  listAnnotations,
} from "../../../mockup";
import {
  annotate,
  MOCKUP,
  put,
  served,
  STAMPED_ID,
} from "../../helpers/mockup-anchors";
import { NAME, sketch, spec, useWorkspace } from "../../helpers/mockup-mcp";

const CONCURRENT_NOTES = 20;

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
  [
    "twelve-space indentation, past the ten JSON.stringify keeps",
    (value) =>
      `${JSON.stringify(value, null, "\t").replaceAll(/^\t+/gm, (tabs) => " ".repeat(12 * tabs.length))}\n`,
  ],
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

describe("[unit] mockup annotation stamps: stored file", () => {
  useWorkspace();

  const note = {
    id: "old",
    text: "old",
    status: "open",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const OLD_FILES: ReadonlyArray<[string, JsonValue]> = [
    [
      "a version 1 file, whose notes store page and path",
      {
        version: 1,
        annotations: [{ ...note, page: "home", path: "/pages/0/tree/0" }],
      },
    ],
    ["a note with no anchor", { version: 2, annotations: [note] }],
  ];

  for (const [older, file] of OLD_FILES) {
    it(`refuses ${older} (fails when an older shape of the file is still read)`, async () => {
      await put(sketch("<p>a</p>"));
      await writeFile(annotationsPath(), JSON.stringify(file));

      await assert.rejects(
        listAnnotations(MOCKUP, defaultMockupsDir()),
        /is not an annotations file/,
      );
    });
  }
});
