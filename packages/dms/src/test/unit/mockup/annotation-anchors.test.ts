import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { defaultMockupsDir } from "../../../mockup";
import {
  annotate,
  block,
  chartCard,
  edit,
  expectBlockAt,
  expectNoLocation,
  header,
  headerRow,
  kpi,
  patchAnswer,
  put,
  putPages,
  served,
  STAMPED_ID,
} from "../../helpers/mockup-anchors";
import { NAME, sketch, spec, useWorkspace } from "../../helpers/mockup-mcp";

describe("[unit] mockup annotation anchors: following a block", () => {
  useWorkspace();

  it("keeps a note on its block after an insert before it (fails when the note stores a pointer)", async () => {
    await put(sketch("<p>a</p>"), sketch("<p>b</p>"));
    const { id } = await annotate("home", "/pages/0/tree/1");

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
    const { id } = await annotate(
      "home",
      "/pages/0/tree/0/children/0/children/0",
    );

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
    const { id } = await annotate("home", "/pages/0/tree/2");

    await edit({ op: "remove", path: "/pages/0/tree/0" });

    await expectBlockAt(id, "/pages/0/tree/1", "html", "<p>c</p>");
  });

  it("follows a page rename and a page inserted before (fails when the note stores the page id or its index)", async () => {
    await putPages([sketch("<p>a</p>")], [sketch("<p>b</p>")]);
    const { id } = await annotate("page-1", "/pages/1/tree/0");

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
    const { id, anchor } = await annotate("home", "/pages/0/tree/1");
    const anchored = anchor?.block ?? "";

    await put(
      sketch("<p>x</p>"),
      block("<p>b</p>", anchored),
      sketch("<p>a</p>"),
    );

    expect(anchored).to.match(STAMPED_ID);
    await expectBlockAt(id, "/pages/0/tree/1", "html", "<p>b</p>");
  });
});

describe("[unit] mockup annotation anchors: a stamped id", () => {
  useWorkspace();

  it("leaves a note with no location once its block is removed, and finds the block again when it is put back (fails when the note is deleted or keeps the old pointer)", async () => {
    await put(sketch("<p>a</p>"), sketch("<p>b</p>"));
    const { id, anchor } = await annotate("home", "/pages/0/tree/1", "tighten");

    await edit({ op: "remove", path: "/pages/0/tree/1" });
    await expectNoLocation(id);
    await edit({
      op: "add",
      path: "/pages/0/tree/0",
      value: block("<p>b</p>", anchor?.block ?? ""),
    });

    expect(await served(id)).to.include({ text: "tighten", status: "open" });
    await expectBlockAt(id, "/pages/0/tree/0", "html", "<p>b</p>");
  });

  it("anchors a note on a block option child through its parent and renames no id (fails when it anchors on the id the two charts share)", async () => {
    await put(chartCard("Sales"), chartCard("Costs"));
    const { id } = await annotate("home", "/pages/0/tree/1/children/0");

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

  it("anchors a note on a block with an author id on its parent with no id, so a block given that id on an earlier page does not take it (fails when the author id anchors the note)", async () => {
    const titled = (title: string): JsonValue => ({
      id: "title",
      type: "KpiCard",
      options: { title },
    });
    await putPages([], [{ type: "GridRow", children: [titled("Two")] }]);
    const { id, anchor } = await annotate(
      "page-1",
      "/pages/1/tree/0/children/0",
    );

    await edit({ op: "add", path: "/pages/0/tree/0", value: titled("New") });

    expect(anchor?.block).to.match(STAMPED_ID);
    expect(anchor).to.deep.include({ steps: ["title"] });
    await expectBlockAt(id, "/pages/1/tree/0/children/0", "title", "Two");
  });

  it("refuses a copy that keeps a stamped id, and keeps the note on the original once the copy drops it (fails when the copy takes the note)", async () => {
    await put(sketch("<p>original</p>"));
    const { id } = await annotate("home", "/pages/0/tree/0");
    const copy: JsonValue[] = [
      { op: "copy", from: "/pages/0/tree/0", path: "/pages/0/tree/0" },
      {
        op: "replace",
        path: "/pages/0/tree/0/options/html",
        value: "<p>copy</p>",
      },
    ];

    const refused = await patchAnswer(...copy);
    await edit(...copy, { op: "remove", path: "/pages/0/tree/0/id" });

    expect(refused.errors.map((error) => error.path)).to.deep.equal([
      "/pages/0/tree/1/id",
    ]);
    await expectBlockAt(id, "/pages/0/tree/1", "html", "<p>original</p>");
  });

  it("gives a note no location when a copy written straight to spec.json keeps its stamped id (fails when the first block with that id takes the note)", async () => {
    await put(sketch("<p>original</p>"));
    const { id, anchor } = await annotate("home", "/pages/0/tree/0");
    const stamped = anchor?.block ?? "";

    await writeFile(
      join(defaultMockupsDir(), NAME, "spec.json"),
      JSON.stringify(
        spec(block("<p>copy</p>", stamped), block("<p>original</p>", stamped)),
      ),
    );

    await expectNoLocation(id);
  });
});

describe("[unit] mockup annotation anchors: author ids", () => {
  useWorkspace();

  it("anchors a note on a page's root whose id another page's root shares on its own page, from the answer on (fails when it names the first block with that id in the spec)", async () => {
    await putPages([header("One")], [header("Two")]);

    const created = await annotate("page-1", "/pages/1/tree/0", "on two");
    await edit({
      op: "add",
      path: "/pages/1/tree/0",
      value: sketch("<p>new</p>"),
    });

    expect(created).to.include({ page: "page-1", path: "/pages/1/tree/0" });
    expect(created.anchor).to.deep.equal({
      block: "header",
      steps: [],
      page: "page-1",
    });
    await expectBlockAt(created.id, "/pages/1/tree/1", "title", "Two");
  });

  it("anchors a note on a child whose id is shared, under a root whose id is shared, on its own page (fails when the walk climbs to the first root with that id)", async () => {
    await putPages([headerRow("One")], [headerRow("Two")]);

    const { id } = await annotate("page-1", "/pages/1/tree/0/children/0");

    expect(await served(id)).to.include({ page: "page-1" });
    await expectBlockAt(id, "/pages/1/tree/0/children/0", "title", "Two");
  });

  it("gives a note no location once the page of its block is renamed, when another page has a block with that id (fails when the note moves to the other page's block)", async () => {
    await putPages([header("One")], [header("Two")]);
    const { id } = await annotate("page-1", "/pages/1/tree/0");

    await edit({ op: "replace", path: "/pages/1/id", value: "renamed" });

    await expectNoLocation(id);
  });

  it("keeps a note on its page's block when another page with a block of that id moves before it (fails when the first block with that id in the spec takes the note)", async () => {
    await putPages([header("One")], [header("Two")]);
    const { id } = await annotate("page-0", "/pages/0/tree/0");

    await edit({ op: "move", from: "/pages/1", path: "/pages/0" });

    expect(await served(id)).to.include({ page: "page-0" });
    await expectBlockAt(id, "/pages/1/tree/0", "title", "One");
  });

  it("gives a note no location once its block is removed, when another page has a block with that id (fails when the other page's block takes the note)", async () => {
    await putPages([header("One")], [header("Two")]);
    const { id } = await annotate("page-0", "/pages/0/tree/0");

    await edit({ op: "remove", path: "/pages/0/tree/0" });

    await expectNoLocation(id);
  });

  it("keeps a note on its block when a block with that id is added to an earlier page (fails when the first block with that id in the spec takes the note)", async () => {
    await putPages([], [header("Two")]);
    const { id } = await annotate("page-1", "/pages/1/tree/0");

    await edit({ op: "add", path: "/pages/0/tree/0", value: header("New") });

    expect(await served(id)).to.include({ page: "page-1" });
    await expectBlockAt(id, "/pages/1/tree/0", "title", "Two");
  });

  it("gives a note no location when a copy of its block keeps the author id on the same page (fails when the copy takes the note)", async () => {
    await putPages([header("Original")]);
    const { id } = await annotate("page-0", "/pages/0/tree/0");

    await edit(
      { op: "copy", from: "/pages/0/tree/0", path: "/pages/0/tree/0" },
      { op: "replace", path: "/pages/0/tree/0/options/title", value: "Copy" },
    );

    await expectNoLocation(id);
  });
});
