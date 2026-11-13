import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import {
  createAnnotation,
  listAnnotations,
  type MockupAnnotation,
  mockupNameSchema,
} from "../../../mockup";
import {
  answer,
  mockupTool,
  NAME,
  sketch,
  spec,
  useWorkspace,
  writeAnswerSchema,
} from "../../helpers/mockup-mcp";

const MOCKUP = mockupNameSchema.parse(NAME);
const CONCURRENT_NOTES = 20;
const STAMPED_ID = /^b-[a-z0-9]{8}$/;

const stampedSpecSchema = z.object({
  pages: z.array(
    z.object({ tree: z.array(z.object({ id: z.string().optional() })) }),
  ),
});

function block(html: string, id: string): JsonValue {
  return { type: "sketch", options: { html, height: 120 }, id };
}

function kpi(title: string): JsonValue {
  return { type: "KpiCard", options: { title } };
}

function chartCard(title: string): JsonValue {
  return {
    type: "ChartCard",
    options: { title },
    children: [{ id: "chart", type: "ChartArea" }],
  };
}

describe("[unit] mockup annotation anchors", () => {
  const workspace = useWorkspace();
  const write = mockupTool("mockup_write_spec");
  const patch = mockupTool("mockup_patch_spec");

  const directory = () => workspace.mockups();

  async function put(...tree: JsonValue[]): Promise<void> {
    const written = await answer(
      write,
      { mockup: NAME, spec: spec(...tree) },
      writeAnswerSchema,
    );
    expect(written.errors).to.deep.equal([]);
  }

  async function edit(...operations: JsonValue[]): Promise<void> {
    const patched = await answer(
      patch,
      { mockup: NAME, patch: operations },
      writeAnswerSchema,
    );
    expect(patched.errors).to.deep.equal([]);
  }

  async function annotate(
    page: string,
    path: string,
    text = "note",
  ): Promise<string> {
    const created = await createAnnotation(
      MOCKUP,
      { page, path, text },
      directory(),
    );
    if (created.kind !== "created")
      throw new Error(`not created: ${created.kind}`);
    return created.annotation.id;
  }

  async function served(id: string): Promise<MockupAnnotation> {
    const note = (await listAnnotations(MOCKUP, directory()))?.find(
      (candidate) => candidate.id === id,
    );
    if (!note) throw new Error(`no annotation ${id}`);
    return note;
  }

  async function expectBlockAt(
    id: string,
    path: string,
    option: string,
    value: string,
  ): Promise<void> {
    expect((await served(id)).path).to.equal(path);
    await edit({ op: "test", path: `${path}/options/${option}`, value });
  }

  async function putPages(...trees: JsonValue[][]): Promise<void> {
    const pages = trees.map((tree, index) => ({
      id: `page-${index}`,
      title: `Page ${index}`,
      tree,
    }));
    const written = await answer(
      write,
      { mockup: NAME, spec: { version: 1, pages } },
      writeAnswerSchema,
    );
    expect(written.errors).to.deep.equal([]);
  }

  function header(title: string): JsonValue {
    return { id: "header", type: "KpiCard", options: { title } };
  }

  function headerRow(title: string): JsonValue {
    return {
      id: "header",
      type: "GridRow",
      children: [{ id: "title", type: "KpiCard", options: { title } }],
    };
  }

  it("keeps a note on its block after an insert before it (fails when the note stores a pointer)", async () => {
    await put(sketch("<p>a</p>"), sketch("<p>b</p>"));
    const id = await annotate("home", "/pages/0/tree/1");

    await edit({
      op: "add",
      path: "/pages/0/tree/0",
      value: sketch("<p>new</p>"),
    });

    await expectBlockAt(id, "/pages/0/tree/2", "html", "<p>b</p>");
  });

  it("keeps a note on its block after a move to another parent (fails when the note stores a pointer)", async () => {
    await put({
      type: "Grid",
      children: [
        { type: "GridRow", children: [kpi("One")] },
        { type: "GridRow", children: [kpi("Two")] },
      ],
    });
    const id = await annotate("home", "/pages/0/tree/0/children/0/children/0");

    await edit({
      op: "move",
      from: "/pages/0/tree/0/children/0/children/0",
      path: "/pages/0/tree/0/children/1/children/0",
    });

    await expectBlockAt(
      id,
      "/pages/0/tree/0/children/1/children/0",
      "title",
      "One",
    );
  });

  it("keeps a note on its block after a sibling is removed (fails when the note stores a pointer)", async () => {
    await put(sketch("<p>a</p>"), sketch("<p>b</p>"), sketch("<p>c</p>"));
    const id = await annotate("home", "/pages/0/tree/2");

    await edit({ op: "remove", path: "/pages/0/tree/0" });

    await expectBlockAt(id, "/pages/0/tree/1", "html", "<p>c</p>");
  });

  it("follows a page rename and a page inserted before (fails when the note stores the page id or its index)", async () => {
    await write.call({
      mockup: NAME,
      spec: {
        version: 1,
        pages: [
          { id: "home", title: "Home", tree: [sketch("<p>a</p>")] },
          { id: "other", title: "Other", tree: [sketch("<p>b</p>")] },
        ],
      },
    });
    const id = await annotate("other", "/pages/1/tree/0");

    await edit({ op: "replace", path: "/pages/1/id", value: "renamed" });
    const renamed = await served(id);
    await edit({
      op: "add",
      path: "/pages/0",
      value: { id: "first", title: "First", tree: [sketch("<p>c</p>")] },
    });

    expect(renamed.page).to.equal("renamed");
    expect(await served(id)).to.include({
      page: "renamed",
      path: "/pages/2/tree/0",
    });
  });

  it("keeps a note on its block through a whole-spec write that keeps the ids (fails when the write drops the anchor's id)", async () => {
    await put(sketch("<p>a</p>"), sketch("<p>b</p>"));
    const id = await annotate("home", "/pages/0/tree/1");
    const first = await served(id);
    const anchored = first.anchor?.block ?? "";

    await write.call({
      mockup: NAME,
      spec: spec(
        sketch("<p>x</p>"),
        block("<p>b</p>", anchored),
        sketch("<p>a</p>"),
      ),
    });

    expect(anchored).to.match(STAMPED_ID);
    await expectBlockAt(id, "/pages/0/tree/1", "html", "<p>b</p>");
  });

  it("leaves a note with no location once its block is removed, and finds the block again when it is put back (fails when the note is deleted or keeps the old pointer)", async () => {
    await put(sketch("<p>a</p>"), sketch("<p>b</p>"));
    const id = await annotate("home", "/pages/0/tree/1", "tighten");
    const anchored = (await served(id)).anchor?.block ?? "";

    await edit({ op: "remove", path: "/pages/0/tree/1" });
    const removed = await served(id);
    await edit({
      op: "add",
      path: "/pages/0/tree/0",
      value: block("<p>b</p>", anchored),
    });

    expect(removed).to.include({ id, text: "tighten", status: "open" });
    expect(removed).to.not.have.property("page");
    expect(removed).to.not.have.property("path");
    await expectBlockAt(id, "/pages/0/tree/0", "html", "<p>b</p>");
  });

  it("anchors a note on a block option child through its parent and renames no id (fails when it anchors on the id the two charts share)", async () => {
    await put(chartCard("Sales"), chartCard("Costs"));
    const id = await annotate("home", "/pages/0/tree/1/children/0");

    await edit({
      op: "add",
      path: "/pages/0/tree/0",
      value: sketch("<p>new</p>"),
    });
    const note = await served(id);

    expect(note.path).to.equal("/pages/0/tree/2/children/0");
    expect(note.anchor?.steps).to.deep.equal(["chart"]);
    expect(note.anchor?.block).to.match(STAMPED_ID);
    await edit(
      { op: "test", path: "/pages/0/tree/1/children/0/id", value: "chart" },
      { op: "test", path: "/pages/0/tree/2/children/0/id", value: "chart" },
      { op: "test", path: "/pages/0/tree/2/options/title", value: "Costs" },
    );
  });

  it("anchors a note on a page's root whose id another page's root shares on its own page, from the answer on (fails when it names the first block with that id in the spec)", async () => {
    await putPages([header("One")], [header("Two")]);

    const created = await createAnnotation(
      MOCKUP,
      { page: "page-1", path: "/pages/1/tree/0", text: "on two" },
      directory(),
    );
    if (created.kind !== "created") throw new Error(created.kind);
    await edit({
      op: "add",
      path: "/pages/1/tree/0",
      value: sketch("<p>new</p>"),
    });

    expect(created.annotation).to.include({
      page: "page-1",
      path: "/pages/1/tree/0",
    });
    expect(await served(created.annotation.id)).to.include({ page: "page-1" });
    await expectBlockAt(
      created.annotation.id,
      "/pages/1/tree/1",
      "title",
      "Two",
    );
  });

  it("anchors a note on a child whose id is shared, under a root whose id is shared, on its own page (fails when the walk climbs to the first root with that id)", async () => {
    await putPages([headerRow("One")], [headerRow("Two")]);

    const id = await annotate("page-1", "/pages/1/tree/0/children/0");

    expect(await served(id)).to.include({ page: "page-1" });
    await expectBlockAt(id, "/pages/1/tree/0/children/0", "title", "Two");
  });

  it("names the first block with a shared id in the spec once the note's page is renamed (fails when the note loses a block that is still there)", async () => {
    await putPages([header("One")], [header("Two")]);
    const id = await annotate("page-1", "/pages/1/tree/0");

    await edit(
      { op: "remove", path: "/pages/0/tree/0" },
      { op: "replace", path: "/pages/1/id", value: "renamed" },
    );

    expect(await served(id)).to.include({ page: "renamed" });
    await expectBlockAt(id, "/pages/1/tree/0", "title", "Two");
  });

  it("migrates a version 1 file by stamping ids, and the notes then follow their blocks (fails when notes keep their pointers or are dropped)", async () => {
    await put(sketch("<p>a</p>"), sketch("<p>b</p>"));
    await writeFile(
      join(directory(), NAME, "annotations.json"),
      JSON.stringify({
        version: 1,
        annotations: ["one", "two"].map((text) => ({
          id: text,
          page: "home",
          path: "/pages/0/tree/1",
          text,
          status: "open",
          createdAt: "2026-01-01T00:00:00.000Z",
        })),
      }),
    );

    const migrated = await listAnnotations(MOCKUP, directory());
    const stamped = await workspace.specBytes();
    const [first, second] = stampedSpecSchema.parse(JSON.parse(stamped))
      .pages[0].tree;
    const again = await listAnnotations(MOCKUP, directory());
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
      join(directory(), NAME, "annotations.json"),
      JSON.stringify({
        version: 1,
        annotations: [
          {
            id: "ghost",
            page: "home",
            path: "/pages/0/tree/7",
            text: "gone",
            status: "open",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const [ghost] = (await listAnnotations(MOCKUP, directory())) ?? [];

    expect(ghost).to.include({ id: "ghost", text: "gone" });
    expect(ghost).to.not.have.property("path");
    expect(ghost).to.not.have.property("anchor");
  });

  it("anchors a note on a block of a spec that has issues, and leaves those issues as they were (fails when the stamp goes through the checked writer)", async () => {
    await put(sketch("<p>a</p>"));
    await writeFile(
      join(directory(), NAME, "spec.json"),
      JSON.stringify(
        spec(sketch("<p>a</p>"), { type: "NoSuchBlock", options: {} }),
      ),
    );
    const before = await workspace.specBytes();

    const id = await annotate("home", "/pages/0/tree/1");
    const note = await served(id);
    const after = await workspace.specBytes();

    expect(before).to.contain("NoSuchBlock");
    expect(note.anchor?.block).to.match(STAMPED_ID);
    expect(note.path).to.equal("/pages/0/tree/1");
    expect(after).to.contain("NoSuchBlock");
    expect(after).to.contain(note.anchor?.block);
  });

  it("answers why when the spec does not parse, and stamps nothing (fails when the note is created on a spec that cannot take an id)", async () => {
    await put(sketch("<p>a</p>"));
    await writeFile(join(directory(), NAME, "spec.json"), "{ not json");

    const created = await createAnnotation(
      MOCKUP,
      { page: "home", path: "/pages/0/tree/0", text: "x" },
      directory(),
    );

    expect(created.kind).to.equal("spec_invalid");
    expect(await workspace.specBytes()).to.equal("{ not json");
    expect(await listAnnotations(MOCKUP, directory())).to.deep.equal([]);
  });

  it("keeps every note of concurrent creates, all anchored on the one id stamped (fails when a stamp is written outside the spec lock)", async () => {
    await put(sketch("<p>a</p>"), sketch("<p>b</p>"));

    const ids = await Promise.all(
      Array.from({ length: CONCURRENT_NOTES }, (_, index) =>
        annotate("home", `/pages/0/tree/${index % 2}`, `note ${index}`),
      ),
    );
    const notes = (await listAnnotations(MOCKUP, directory())) ?? [];

    expect(new Set(notes.map((note) => note.id))).to.deep.equal(new Set(ids));
    expect(
      notes
        .flatMap((note) => note.path ?? [])
        .sort((a, b) => a.localeCompare(b)),
    ).to.deep.equal(
      Array.from(
        { length: CONCURRENT_NOTES },
        (_, index) => `/pages/0/tree/${index % 2}`,
      ).sort((a, b) => a.localeCompare(b)),
    );
    expect(new Set(notes.map((note) => note.anchor?.block)).size).to.equal(2);
  });
});
