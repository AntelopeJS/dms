import fs from "node:fs";
import path from "node:path";
import type { PageStructure } from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import fc from "fast-check";
import {
  ConfigureCategory,
  ConfigurePage,
  GetPageStructure,
  ListCategories,
  SetPageBlocks,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import {
  CALL_HELPERS,
  isRead,
  type OptionSource,
  type OptionSpelling,
  optionSpelling,
  writeOption,
} from "./helpers/option-spellings";

const SEED = 20261116;
const RUNS = 12;
/** A block option stays short, so the block fits the line the builder writes it on. */
const BLOCK_WIDTH = 4;
const PAGE = "/board/overview";
const CATEGORY = "pages.board";
const PAGE_FILE = "board/page.ts";
const CATEGORY_FILE = "board/category.ts";

const PAGE_HEAD = `import { KpiCard } from "@antelopejs/interface-dms/base";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { boardCategory } from "./category";`;
const CATEGORY_HEAD = `import { Category, pagesCategory } from "@antelopejs/interface-dms/page";`;

/** The options of a generated page, its block and its category. */
interface Options {
  page: OptionSpelling[];
  block: OptionSpelling[];
  category: OptionSpelling[];
}

function optional(
  key: string,
  kind: "string" | "number" | "boolean",
  width?: number,
): fc.Arbitrary<OptionSpelling[]> {
  return fc
    .option(optionSpelling(key, kind, width), { nil: undefined })
    .map((spelling) => (spelling ? [spelling] : []));
}

function sequence(
  parts: fc.Arbitrary<OptionSpelling[]>[],
): fc.Arbitrary<OptionSpelling[]> {
  return fc.tuple(...parts).map((groups) => groups.flat());
}

const OPTIONS: fc.Arbitrary<Options> = fc
  .record({
    page: sequence([
      optionSpelling("displayName", "string").map((spelling) => [spelling]),
      optional("icon", "string"),
      optional("order", "number"),
      optional("hidden", "boolean"),
      optional("description", "string"),
    ]),
    block: sequence([
      optionSpelling("title", "string", BLOCK_WIDTH).map((spelling) => [
        spelling,
      ]),
      optional("fetchUrl", "string", BLOCK_WIDTH),
    ]),
    category: sequence([
      optionSpelling("displayName", "string").map((spelling) => [spelling]),
      optional("icon", "string"),
      optional("order", "number"),
    ]),
  })
  .filter(({ block }) => block.every(({ form }) => form !== "shorthand"))
  .filter(
    ({ block }) =>
      block.length === 1 || block.every(({ form }) => isRead(form)),
  );

function sourceOf(
  options: OptionSpelling[],
  module: string,
  prefix: string,
): OptionSource {
  const source: OptionSource = {
    module,
    prefix,
    imports: [],
    declarations: [],
    values: [],
    entries: [],
  };
  options.forEach((option, index) => writeOption(option, index, source));
  return source;
}

function helpersFor(sources: OptionSource[]): string {
  const text = sources.flatMap((source) => source.entries).join("\n");
  return CALL_HELPERS.split("\n\n")
    .filter((helper) => text.includes(`${/function (\w+)/.exec(helper)?.[1]}(`))
    .join("\n\n");
}

function unique(lines: string[]): string {
  return [...new Set(lines)].join("\n");
}

const LINE_WIDTH = 80;

/** The block as the builder writes it: on one line when it fits, one option per line otherwise. */
function blockOf(entries: string[]): string {
  const line = `  static revenueKpi = KpiCard({ ${entries.join(", ")} });`;
  return line.length <= LINE_WIDTH
    ? line
    : `  static revenueKpi = KpiCard({\n${entries.map((entry) => `    ${entry},`).join("\n")}\n  });`;
}

/** The files the options generate: the page, its category and the values each imports. */
interface Files {
  page: string;
  values: string;
  category: string;
  categoryValues: string;
}

function filesFor(options: Options): Files {
  const page = sourceOf(options.page, "./values", "p");
  const block = sourceOf(options.block, "./values", "b");
  const category = sourceOf(options.category, "./category-values", "c");
  const pageSources = [page, block];
  return {
    page: `${PAGE_HEAD}
${unique(pageSources.flatMap((source) => source.imports))}

${pageSources.flatMap((source) => source.declarations).join("\n")}

${helpersFor(pageSources)}

@RegisterPage()
export class BoardPage extends PageController(
  "overview",
  {
    ${page.entries.map((entry) => `${entry},`).join("\n    ")}
    category: boardCategory,
  },
  DefaultLayout({ fullWidth: true }),
) {
${blockOf(block.entries)}
}
`,
    values: `${pageSources.flatMap((source) => source.values).join("\n")}\nexport {};\n`,
    category: `${CATEGORY_HEAD}
${unique(category.imports)}

${category.declarations.join("\n")}

${helpersFor([category])}

export const boardCategory = Category("board", {
  ${category.entries.map((entry) => `${entry},`).join("\n  ")}
  category: pagesCategory,
});
`,
    categoryValues: `${category.values.join("\n")}\nexport {};\n`,
  };
}

function valueOfEvaluable(
  options: OptionSpelling[],
  values: Map<string, unknown>,
  where: string,
): void {
  for (const option of options.filter((spelling) => isRead(spelling.form))) {
    expect(
      values.get(option.key),
      `${where} ${option.key} written as ${option.form}`,
    ).to.deep.equal(option.value);
  }
}

let app: Fixture;

function writeFiles(files: Files): void {
  app.write(PAGE_FILE, files.page);
  app.write("board/values.ts", files.values);
  app.write(CATEGORY_FILE, files.category);
  app.write("board/category-values.ts", files.categoryValues);
}

/** The lines of `after` that differ from `before`, for the message of a failure. */
function changedLines(before: string, after: string): string {
  const was = before.split("\n");
  const now = after.split("\n");
  return Array.from({ length: Math.max(was.length, now.length) }, (_, line) =>
    was[line] === now[line]
      ? undefined
      : `line ${line + 1}: ${JSON.stringify(was[line])} became ${JSON.stringify(now[line])}`,
  )
    .filter((entry) => entry !== undefined)
    .join("\n");
}

function unchanged(files: Files, step: string): void {
  for (const [file, before] of [
    [PAGE_FILE, files.page],
    [CATEGORY_FILE, files.category],
  ] as const) {
    const written = app.read(file);
    expect(
      written === before,
      `${step} rewrote ${file}:\n${changedLines(before, written)}\n--- source:\n${before}`,
    ).to.equal(true);
  }
}

async function readStructure(): Promise<PageStructure> {
  return expectOk(await GetPageStructure(PAGE), "GetPageStructure");
}

/** Saves the page with the blocks as read, and the page options as read when `page` is given. */
async function saveBlocksAsRead(
  { blocks }: PageStructure,
  page?: Parameters<typeof SetPageBlocks>[1]["page"],
): Promise<void> {
  expectOk(
    await SetPageBlocks(PAGE, {
      page,
      blocks: blocks.map((block) => ({
        name: block.name,
        type: block.type ?? undefined,
        config: block.config,
      })),
    }),
    "SetPageBlocks",
  );
}

/**
 * Reads a generated page, block and category, checks each option written
 * without running code reads as the value it holds, then sends the values read
 * back through every save the dashboard has and checks no file changed.
 */
async function roundTrip(options: Options): Promise<void> {
  const files = filesFor(options);
  writeFiles(files);
  const structure = await readStructure();
  const { page, blocks } = structure;
  const category = (await ListCategories()).find(
    (summary) => summary.ref === CATEGORY,
  );
  expect(category, "the category is listed").to.not.equal(undefined);
  valueOfEvaluable(
    options.page,
    new Map<string, unknown>([
      ["displayName", page.displayName],
      ["icon", page.icon],
      ["order", page.order],
      ["hidden", page.hidden],
      ["description", page.description],
    ]),
    "page",
  );
  valueOfEvaluable(
    options.block,
    new Map(Object.entries(blocks[0]?.config ?? {})),
    "block",
  );
  valueOfEvaluable(
    options.category,
    new Map<string, unknown>([
      ["displayName", category?.displayName],
      ["icon", category?.icon],
      ["order", category?.order],
    ]),
    "category",
  );

  const { displayName, icon, order, hidden, description } = page;
  const echo = { displayName, icon, order, hidden, description };
  expectOk(
    await ConfigurePage(PAGE, { ...echo, category: page.category }),
    "ConfigurePage",
  );
  unchanged(files, "ConfigurePage with the options read");
  if (icon === undefined) {
    expectOk(
      await ConfigurePage(PAGE, {
        ...echo,
        category: page.category,
        ...Object.fromEntries([["icon", null]]),
      }),
      "ConfigurePage",
    );
    unchanged(files, "ConfigurePage with an icon read as nothing sent as null");
  }

  await saveBlocksAsRead(structure, echo);
  unchanged(files, "SetPageBlocks with the options read");

  const meta = {
    displayName: category?.displayName,
    icon: category?.icon,
    order: category?.order,
    parent: category?.parent,
  };
  expectOk(await ConfigureCategory(CATEGORY, meta), "ConfigureCategory");
  unchanged(files, "ConfigureCategory with the options read");
  if (category?.icon === undefined) {
    expectOk(
      await ConfigureCategory(CATEGORY, {
        ...meta,
        ...Object.fromEntries([["icon", null]]),
      }),
      "ConfigureCategory",
    );
    unchanged(
      files,
      "ConfigureCategory with an icon read as nothing sent as null",
    );
  }
}

describe("formal: reading builder options and writing them back is a no-op", function () {
  this.timeout(60_000 * 30);

  before(() => {
    app = createFixture();
    fs.mkdirSync(path.join(app.root, "src", "board"), { recursive: true });
    app.write("index.ts", 'import "./board/page";\n\nexport {};\n');
  });

  after(() => destroyFixture());

  it("leaves the file byte-identical for options written as literals, constants, imports, enums, templates, shorthand and calls", async () => {
    const outcome = await fc.check(
      fc.asyncProperty(OPTIONS, async (options) => {
        await roundTrip(options);
      }),
      { seed: SEED, numRuns: RUNS },
    );
    expect(
      outcome.failed,
      `${fc.defaultReportMessage(outcome)}\n${String(outcome.errorInstance)}`,
    ).to.equal(false);
  });
});

const LITERAL_PAGE: OptionSpelling[] = [
  {
    key: "displayName",
    kind: "string",
    value: "Board",
    form: "literal",
    split: 0,
  },
];
const LITERAL_CATEGORY: OptionSpelling[] = [
  {
    key: "displayName",
    kind: "string",
    value: "Shop",
    form: "literal",
    split: 0,
  },
];

function withBlock(...block: OptionSpelling[]): Options {
  return { page: LITERAL_PAGE, block, category: LITERAL_CATEGORY };
}

function titled(form: OptionSpelling["form"]): OptionSpelling {
  return { key: "title", kind: "string", value: "Aa", form, split: 0 };
}

const FETCH_URL: OptionSpelling = {
  key: "fetchUrl",
  kind: "string",
  value: "/a",
  form: "literal",
  split: 0,
};

describe("formal: findings of the option echo on the code today", function () {
  this.timeout(120_000);

  before(() => {
    app = createFixture();
    fs.mkdirSync(path.join(app.root, "src", "board"), { recursive: true });
    app.write("index.ts", 'import "./board/page";\n\nexport {};\n');
  });

  after(() => destroyFixture());

  it("F1: an option written through a namespace import reads as nothing", async () => {
    writeFiles(
      filesFor({
        page: [
          ...LITERAL_PAGE,
          {
            key: "icon",
            kind: "string",
            value: "i-x",
            form: "namespace",
            split: 0,
          },
        ],
        block: [titled("literal")],
        category: LITERAL_CATEGORY,
      }),
    );
    const { page } = await readStructure();
    expect(
      page.icon,
      "F1 no longer reproduces: remove it from here and from SKILL.md",
    ).to.equal(undefined);
  });

  it("F2: a block option written as code makes the echo quote the keys of its other options", async () => {
    const files = filesFor(withBlock(titled("call"), FETCH_URL));
    writeFiles(files);
    await saveBlocksAsRead(await readStructure());
    expect(
      app.read(PAGE_FILE),
      "F2 no longer reproduces: remove it from here and from SKILL.md",
    ).to.contain('"fetchUrl": "/a"');
  });

  it("F3: a block option written as shorthand is written back as key and value", async () => {
    writeFiles(filesFor(withBlock(titled("shorthand"), FETCH_URL)));
    await saveBlocksAsRead(await readStructure());
    expect(
      app.read(PAGE_FILE),
      "F3 no longer reproduces: remove it from here and from SKILL.md",
    ).to.contain("title: title");
  });
});
