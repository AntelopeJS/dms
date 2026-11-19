import Ajv2020 from "ajv/dist/2020";
import { expect } from "chai";
import {
  compileSpec,
  type CompiledSpec,
  type JsonObject,
  mockupNameSchema,
  parseSpec,
} from "../../../mockup";
import { MOCKUP_SPEC_SCHEMA } from "../../helpers/mockup-spec-schema";

const validate = new Ajv2020({ validateFormats: false }).compile(
  MOCKUP_SPEC_SCHEMA,
);

const DEMO = mockupNameSchema.parse("demo");

const ORDERS: JsonObject = { id: "orders", title: "Orders", tree: [] };

function read(pages: JsonObject[]) {
  return parseSpec(JSON.stringify({ version: 1, pages }));
}

function compile(page: JsonObject): CompiledSpec {
  const parsed = read([page, ORDERS]);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return compileSpec(DEMO, parsed.spec);
}

const board = (fields: JsonObject): JsonObject => ({
  id: "board",
  title: "Board",
  custom: true,
  ...fields,
});

describe("[unit] mockup custom pages", () => {
  it("draws a custom page as one sketch of its html, css and states, 800 pixels tall by default, its page links followed, with no node to select (fails when it is drawn as blocks or loses a field)", () => {
    const compiled = compile(
      board({
        html: '<div class="lanes"><a href="page:orders">Orders</a></div>',
        css: ".lanes{display:flex}",
        states: { empty: "<p>No cards</p>" },
      }),
    );
    const [page] = compiled.pages;

    expect(compiled.issues).to.deep.equal([]);
    expect(page.custom).to.equal(true);
    expect(page.tree).to.deep.equal([
      {
        type: "sketch",
        options: {
          html: '<div class="lanes"><a href="/mockup?name=demo&amp;page=orders" target="_top">Orders</a></div>',
          height: 800,
          css: ".lanes{display:flex}",
          states: { empty: "<p>No cards</p>" },
        },
      },
    ]);
    expect(page.paths).to.deep.equal({});
    expect(page.links).to.deep.equal(["orders"]);
    expect(compiled.pages[1]).to.not.have.property("custom");
  });

  it("takes an empty tree as well as none, and the height it sets (fails when an empty tree is refused)", () => {
    const compiled = compile(
      board({ html: "<p>x</p>", height: 3000, tree: [] }),
    );

    expect(compiled.issues).to.deep.equal([]);
    expect(compiled.pages[0].tree[0].options).to.deep.include({ height: 3000 });
  });

  it("refuses a custom page holding blocks or no html, and a page of blocks holding a custom page's fields, each at its field (fails when one is accepted)", () => {
    const answers = [
      read([board({ html: "<p>x</p>", tree: [{ type: "sketch" }] })]),
      read([board({})]),
      read([{ ...ORDERS, html: "<p>x</p>", states: { empty: "<p>y</p>" } }]),
    ].map((answer) => (answer.ok ? [] : answer.issues.map(({ path }) => path)));

    expect(answers).to.deep.equal([
      ["/pages/0/tree"],
      ["/pages/0/html"],
      ["/pages/0/html", "/pages/0/states"],
    ]);
  });

  it("checks a custom page's fields as a sketch's, at the page's own pointers (fails when a field is left unchecked)", () => {
    const paths = [
      board({ html: "<p>x</p>", height: 3001 }),
      board({ html: "<p>x</p>", states: { Empty: "<p>y</p>" } }),
      board({ html: 5 }),
      board({ html: '<a href="page:missing">x</a>' }),
    ].map((page) => compile(page).issues.map(({ path }) => path));

    expect(paths).to.deep.equal([
      ["/pages/0/height"],
      ["/pages/0/states/Empty"],
      ["/pages/0/html"],
      ["/pages/0/html"],
    ]);
  });

  it("refuses a script, an event handler or a javascript: link in a custom page or one of its states, drawing it empty (fails when a custom page skips the check)", () => {
    const compiled = compile(
      board({
        html: '<p onclick="alert(1)">x</p>',
        states: {
          loading: "<script>alert(1)</script>",
          error: '<a href="javascript:alert(1)">retry</a>',
        },
      }),
    );

    expect(compiled.issues.map(({ path }) => path)).to.deep.equal([
      "/pages/0/html",
      "/pages/0/states/loading",
      "/pages/0/states/error",
    ]);
    expect(compiled.pages[0].tree[0].options).to.deep.include({
      html: "",
      states: { loading: "", error: "" },
    });
  });

  it("is described by the shipped JSON Schema, which refuses the same mismatches (fails when the schema still requires a tree or takes html on a page of blocks)", () => {
    const valid = (page: JsonObject) => validate({ version: 1, pages: [page] });

    expect([
      valid(board({ html: "<p>x</p>", states: { empty: "<p>y</p>" } })),
      valid(board({ html: "<p>x</p>", tree: [] })),
      valid(ORDERS),
      valid(board({})),
      valid(board({ html: "<p>x</p>", tree: [{ type: "sketch" }] })),
      valid({ ...ORDERS, html: "<p>x</p>" }),
    ]).to.deep.equal([true, true, true, false, false, false]);
  });
});
