import { expect } from "chai";
import { z } from "zod";
import {
  annotationDraftSchema,
  type CompiledSpec,
  compileSpec,
  createAnnotation,
  defaultMockupsDir,
  type Json,
  type JsonObject,
  mockupNameSchema,
  parseSpec,
  updateAnnotation,
} from "../../../mockup";
import { SKETCH_MAX_SOURCE } from "../../../mockup/sketch";
import { MOCKUP, put, served } from "../../helpers/mockup-anchors";
import { useWorkspace } from "../../helpers/mockup-mcp";

const DEMO = mockupNameSchema.parse("demo");

function compile(options: JsonObject): CompiledSpec {
  const spec = {
    version: 1,
    pages: [
      { id: "home", title: "Home", tree: [{ type: "sketch", options }] },
      { id: "orders", title: "Orders", tree: [] },
    ],
  };
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

const drawnSchema = z
  .object({ html: z.string(), states: z.record(z.string()).optional() })
  .passthrough();

const drawn = (compiled: CompiledSpec) =>
  drawnSchema.parse(compiled.pages[0].tree[0].options);

const AT = "/pages/0/tree/0/options";

describe("[unit] mockup sketch states", () => {
  it("draws each named state checked as the html is, its page links rewritten, the css once for all (fails when states are dropped or left unchecked)", () => {
    const compiled = compile({
      html: "<p>3 orders</p>",
      css: "p{margin:0}",
      states: {
        empty: '<p>No orders yet.</p><a href="page:orders">Add one</a>',
        error: "<p class='x'>Could not load the orders.</p>",
      },
    });

    expect(compiled.issues).to.deep.equal([]);
    expect(drawn(compiled)).to.deep.include({
      html: "<p>3 orders</p>",
      css: "p{margin:0}",
      states: {
        empty:
          '<p>No orders yet.</p><a href="/mockup?name=demo&amp;page=orders" target="_top">Add one</a>',
        error: '<p class="x">Could not load the orders.</p>',
      },
    });
    expect(compiled.pages[0].links).to.deep.equal(["orders"]);
  });

  it("reports a state named out of pattern or default, more than 8 states and a state past the size cap, each at its pointer (fails when one is accepted)", () => {
    const nine = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`s${index}`, "<p>x</p>"]),
    );
    const paths = [
      { Empty: "<p>x</p>" },
      { default: "<p>x</p>" },
      nine,
      { big: "x".repeat(SKETCH_MAX_SOURCE + 1) },
    ].map((states) =>
      compile({ html: "<p>x</p>", states }).issues.map((issue) => issue.path),
    );

    expect(paths).to.deep.equal([
      [`${AT}/states/Empty`],
      [`${AT}/states/default`],
      [`${AT}/states`],
      [`${AT}/states/big`],
    ]);
  });

  it("refuses a script, an event handler or a javascript: link in a state at that state, drawing it empty and keeping the others (fails when a state skips the check)", () => {
    const compiled = compile({
      html: "<p>x</p>",
      states: {
        script: "<p>y</p><script>alert(1)</script>",
        handler: '<p onclick="alert(1)">y</p>',
        link: '<a href="javascript:alert(1)">y</a>',
        fine: "<p>fine</p>",
      },
    });

    expect(compiled.issues.map((issue) => issue.path)).to.deep.equal([
      `${AT}/states/script`,
      `${AT}/states/handler`,
      `${AT}/states/link`,
    ]);
    expect(drawn(compiled).states).to.deep.equal({
      script: "",
      handler: "",
      link: "",
      fine: "<p>fine</p>",
    });
  });
});

describe("[unit] mockup sketch states on comments", () => {
  useWorkspace();

  const sketchWithStates: Json = {
    id: "orders-zone",
    type: "sketch",
    options: { html: "<p>x</p>", states: { empty: "<p>none</p>" } },
  };
  const pointer = "/pages/0/tree/0";

  it("keeps the state a note was pinned on, and the state of the place it moves to (fails when the state is dropped or kept after a move)", async () => {
    await put(sketchWithStates);

    const created = await createAnnotation(
      MOCKUP,
      {
        page: "home",
        path: pointer,
        text: "say how to add one",
        offset: { x: 0.5, y: 0.5 },
        state: "empty",
      },
      defaultMockupsDir(),
    );
    if (created.kind !== "created") throw new Error(created.kind);
    const pinned = await served(created.annotation.id);
    await updateAnnotation(
      MOCKUP,
      created.annotation.id,
      { place: { page: "home", path: pointer, offset: { x: 0, y: 0 } } },
      defaultMockupsDir(),
    );
    const moved = await served(created.annotation.id);

    expect(pinned.state).to.equal("empty");
    expect(moved.state).to.equal(undefined);
  });

  it("refuses a pin whose state is no state name (fails when any text is stored)", () => {
    const place = { page: "home", text: "x", offset: { x: 0, y: 0 } };

    expect([
      annotationDraftSchema.safeParse({ ...place, state: "empty" }).success,
      annotationDraftSchema.safeParse({ ...place, state: "Not a state" })
        .success,
    ]).to.deep.equal([true, false]);
  });
});
