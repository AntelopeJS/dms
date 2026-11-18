import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "chai";
import { z } from "zod";
import {
  createAnnotation,
  defaultMockupsDir,
  deleteAnnotation,
  listAnnotations,
  type MockupAnnotation,
  updateAnnotation,
} from "../../../mockup";
import {
  annotate,
  blockAnchorOf,
  edit,
  MOCKUP,
  put,
  putPages,
  served,
  STAMPED_ID,
} from "../../helpers/mockup-anchors";
import {
  answer,
  mockupTool,
  NAME,
  sketch,
  useWorkspace,
} from "../../helpers/mockup-mcp";

const TOP_RIGHT = { x: 1, y: 0 };
const LOWER_LEFT = { x: 0.2, y: 0.8 };

function annotationsPath(): string {
  return join(defaultMockupsDir(), NAME, "annotations.json");
}

/** Pins a note on page `page` as a whole, and answers it as created. */
async function pinOnPage(
  page: string,
  text = "page note",
): Promise<MockupAnnotation> {
  const created = await createAnnotation(
    MOCKUP,
    { page, text, offset: LOWER_LEFT },
    defaultMockupsDir(),
  );
  if (created.kind !== "created") {
    throw new Error(`not created: ${created.kind}`);
  }
  return created.annotation;
}

async function moved(
  id: string,
  place: { page: string; path?: string; offset: { x: number; y: number } },
) {
  return updateAnnotation(MOCKUP, id, { place }, defaultMockupsDir());
}

const listedSchema = z.object({
  annotations: z.array(
    z.object({ text: z.string(), page: z.string().optional() }),
  ),
});

describe("[unit] mockup annotation pins: a note on a page", () => {
  useWorkspace();

  it("serves a note on a page with its page and no path, and the AI lists it under that page (fails when a page note anchors on a block)", async () => {
    await putPages([sketch("<p>a</p>")], [sketch("<p>b</p>")]);

    const note = await pinOnPage("page-1");
    const listed = await answer(
      mockupTool("mockup_annotations"),
      { mockup: NAME, page: "page-1" },
      listedSchema,
    );

    expect(note.anchor).to.deep.equal({ page: "page-1" });
    expect(note).to.include({ page: "page-1" });
    expect(note).to.not.have.property("path");
    expect(note.offset).to.deep.equal(LOWER_LEFT);
    expect(listed.annotations).to.deep.equal([
      { text: "page note", page: "page-1" },
    ]);
  });

  it("leaves a page note with no location once its page is removed (fails when it keeps the page)", async () => {
    await putPages([sketch("<p>a</p>")], [sketch("<p>b</p>")]);
    const { id } = await pinOnPage("page-1");

    await edit({ op: "remove", path: "/pages/1" });
    const note = await served(id);

    expect(note).to.not.have.property("page");
    expect(note).to.not.have.property("path");
  });

  it("refuses a note on a page the spec does not have (fails when it is stored as an orphan)", async () => {
    await put(sketch("<p>a</p>"));

    const created = await createAnnotation(
      MOCKUP,
      { page: "ghost", text: "nowhere", offset: LOWER_LEFT },
      defaultMockupsDir(),
    );

    expect(created).to.deep.equal({ kind: "no_node" });
    expect(await listAnnotations(MOCKUP, defaultMockupsDir())).to.deep.equal(
      [],
    );
  });
});

describe("[unit] mockup annotation pins: moving a pin", () => {
  useWorkspace();

  it("re-anchors a note dropped on another block, stamping that block's id, at the new offset (fails when the move keeps the old block)", async () => {
    await put(sketch("<p>a</p>"), sketch("<p>b</p>"));
    const { id, anchor } = await annotate("home", "/pages/0/tree/0");

    const update = await moved(id, {
      page: "home",
      path: "/pages/0/tree/1",
      offset: TOP_RIGHT,
    });
    await edit({ op: "remove", path: "/pages/0/tree/0" });
    const note = await served(id);

    expect(update.kind).to.equal("updated");
    expect(blockAnchorOf(note).block).to.match(STAMPED_ID);
    expect(blockAnchorOf(note).block).to.not.equal(anchor.block);
    expect(note).to.include({ page: "home", path: "/pages/0/tree/0" });
    expect(note.offset).to.deep.equal(TOP_RIGHT);
  });

  it("makes a note dropped off every block a note on its page, and back on a block (fails when a page move keeps the block)", async () => {
    await put(sketch("<p>a</p>"));
    const { id } = await annotate("home", "/pages/0/tree/0");

    await moved(id, { page: "home", offset: LOWER_LEFT });
    const onPage = await served(id);
    await moved(id, {
      page: "home",
      path: "/pages/0/tree/0",
      offset: TOP_RIGHT,
    });
    const onBlock = await served(id);

    expect(onPage.anchor).to.deep.equal({ page: "home" });
    expect(onPage).to.not.have.property("path");
    expect(onBlock).to.include({ page: "home", path: "/pages/0/tree/0" });
  });

  it("keeps an orphan's text and status and gives it a location when it is dropped on a block (fails when re-anchoring resets the note)", async () => {
    await put(sketch("<p>a</p>"), sketch("<p>b</p>"));
    const { id } = await annotate("home", "/pages/0/tree/1", "tighten");
    await edit({ op: "remove", path: "/pages/0/tree/1" });

    const update = await moved(id, {
      page: "home",
      path: "/pages/0/tree/0",
      offset: TOP_RIGHT,
    });

    expect(update.kind === "updated" && update.annotation).to.include({
      text: "tighten",
      status: "open",
      page: "home",
      path: "/pages/0/tree/0",
    });
  });

  it("refuses a move onto a node the spec does not have and leaves the note where it was (fails when a refused move writes the note)", async () => {
    await put(sketch("<p>a</p>"));
    const { id } = await annotate("home", "/pages/0/tree/0");
    const before = await readFile(annotationsPath(), "utf8");

    const update = await moved(id, {
      page: "home",
      path: "/pages/0/tree/7",
      offset: TOP_RIGHT,
    });

    expect(update).to.deep.equal({ kind: "no_node" });
    expect(await readFile(annotationsPath(), "utf8")).to.equal(before);
  });
});

describe("[unit] mockup annotation pins: deleting and older files", () => {
  useWorkspace();

  it("deletes one note for good and answers false for an id it does not have (fails when delete only resolves)", async () => {
    await put(sketch("<p>a</p>"));
    const kept = await annotate("home", "/pages/0/tree/0", "keep");
    const dropped = await annotate("home", "/pages/0/tree/0", "drop");

    const deleted = await deleteAnnotation(
      MOCKUP,
      dropped.id,
      defaultMockupsDir(),
    );
    const again = await deleteAnnotation(
      MOCKUP,
      dropped.id,
      defaultMockupsDir(),
    );
    const listed = await listAnnotations(MOCKUP, defaultMockupsDir());

    expect([deleted, again]).to.deep.equal([true, false]);
    expect(listed?.map(({ id }) => id)).to.deep.equal([kept.id]);
  });

  it("reads a version 2 file with each note at its block's top left corner, and writes version 3 on the next change (fails when a version 2 file is refused)", async () => {
    await put(sketch("<p>a</p>"));
    const { anchor } = await annotate("home", "/pages/0/tree/0");
    await writeFile(
      annotationsPath(),
      JSON.stringify({
        version: 2,
        annotations: [
          {
            id: "old",
            anchor,
            text: "old note",
            status: "open",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const note = await served("old");
    await updateAnnotation(
      MOCKUP,
      "old",
      { status: "resolved" },
      defaultMockupsDir(),
    );
    const written = z
      .object({ version: z.number() })
      .parse(JSON.parse(await readFile(annotationsPath(), "utf8")));

    expect(note).to.include({ page: "home", path: "/pages/0/tree/0" });
    expect(note.offset).to.deep.equal({ x: 0, y: 0 });
    expect(written.version).to.equal(3);
  });
});
