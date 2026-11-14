import { expect } from "chai";
import {
  ConfigurePage,
  CreateCategory,
  CreatePage,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
  type FixtureOptions,
} from "./harness";

const PAGE = "/shop/board";
const PAGE_FILE = "board/page.ts";
const LABELS_FILE = "board/labels.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;
let emitted = "";

/**
 * Writes the page with `binding` above it and its title read from `title`,
 * then renames the page.
 *
 * @param title What the author wrote as the page's title
 * @param binding The statements written above the page
 * @returns The page file after the rename
 */
async function renameFrom(title: string, binding: string): Promise<string> {
  const written = emitted
    .replace('displayName: "Board"', `displayName: ${title}`)
    .replace("@RegisterPage(", `${binding}\n\n@RegisterPage(`);
  expect(written, "the page holds the edit").to.contain(title);
  app.write(PAGE_FILE, written);
  expectOk(
    await ConfigurePage(PAGE, { displayName: "Shop board" }),
    "ConfigurePage",
  );
  return app.read(PAGE_FILE);
}

function withPage(options: FixtureOptions): void {
  before(async function () {
    this.timeout(120_000);
    app = createFixture(options);
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    expectOk(
      await CreatePage({
        name: "board",
        displayName: "Board",
        category: "pages.shop",
      }),
      "CreatePage",
    );
    emitted = app.read(PAGE_FILE);
    app.write(LABELS_FILE, "export type board = string;\n");
  });

  after(() => destroyFixture());
}

/**
 * The prune follows symbols, not spellings: a binding only the replaced title
 * read goes whatever declares it, and the app compiling with `noUnusedLocals`
 * accepts the save.
 */
describe("the binding forms a patched option read", () => {
  withPage({ compilerOptions: { noUnusedLocals: true } });

  const cases: Array<[string, string, string, string]> = [
    [
      "a constant spelled like a static member",
      "row",
      'const row = "Board";\nexport class Holder {\n  static row = 1;\n}',
      "const row",
    ],
    [
      "a constant spelled like an interface member",
      "row",
      'const row = "Board";\nexport interface Shape {\n  row: string;\n}',
      "const row",
    ],
    [
      "an enum",
      "Label.Board",
      'enum Label {\n  Board = "Board",\n}',
      "enum Label",
    ],
    [
      "a class",
      "Labels.board",
      'class Labels {\n  static board = "Board";\n}',
      "class Labels",
    ],
    [
      "an object destructuring",
      "board",
      'const { board } = { board: "Board" };',
      "const { board }",
    ],
    [
      "a name destructured from an interface-typed value",
      "board",
      'export interface Labels {\n  board: string;\n}\nconst labels: Labels = { board: "Board" };\nconst { board } = labels;\nexport const other = labels.board;',
      "const { board }",
    ],
    [
      "one name of an array destructuring",
      "board",
      'const labels = ["Board", "Other"];\nconst [board, other] = labels;\nexport const kept = other;',
      "board,",
    ],
    [
      "a merged interface",
      '({ row: "Board", col: 1 } satisfies Shape).row',
      "interface Shape {\n  row: string;\n}\ninterface Shape {\n  col: number;\n}",
      "interface Shape",
    ],
    [
      "a merged enum",
      "Label.Board",
      'enum Label {\n  Board = "Board",\n}\nenum Label {\n  Other = "Other",\n}',
      "enum Label",
    ],
    [
      "an overloaded function",
      'label("Board")',
      "function label(value: string): string;\nfunction label(value: number): string;\nfunction label(value: unknown): string {\n  return String(value);\n}",
      "function label",
    ],
  ];

  for (const [form, title, binding, gone] of cases) {
    it(`drops ${form} only the title read`, async function () {
      this.timeout(OP_TIMEOUT);
      expect(await renameFrom(title, binding)).to.not.contain(gone);
    });
  }

  it("drops one name of a destructured literal with its member", async function () {
    this.timeout(OP_TIMEOUT);
    const written = await renameFrom(
      "board",
      'const { board, other } = { board: "Board", other: "Other" };\nexport const kept = other;',
    );
    expect(written).to.contain('const { other } = { other: "Other" };');
  });
});

/**
 * A name the replaced title only spelled, as a parameter, a method or the
 * right side of a qualified type name, is not a read: an author's unused local
 * of that spelling is theirs, and stays.
 */
describe("an unused local the patched option only spelled", () => {
  withPage({});

  const draft = 'const board = "draft";';
  const cases: Array<[string, string, string]> = [
    ["a parameter", '((board: string) => board)("Board")', draft],
    ["a method", '({ board() { return "Board"; } }).board()', draft],
    [
      "a qualified type name",
      '"Board" as labels.board',
      `import type * as labels from "./labels";\n${draft}`,
    ],
  ];

  for (const [form, title, binding] of cases) {
    it(`keeps a local spelled like ${form}`, async function () {
      this.timeout(OP_TIMEOUT);
      expect(await renameFrom(title, binding)).to.contain(draft);
    });
  }
});
