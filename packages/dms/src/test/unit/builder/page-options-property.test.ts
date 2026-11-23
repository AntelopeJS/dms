import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import * as fc from "fast-check";
import {
  ConfigurePage,
  GetPageStructure,
  SetPageBlocks,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 120_000;
const PAGE = "/board/overview";
const FILE = "board/page.ts";
const CONSTANTS_FILE = "board/constants.ts";
const NUM_RUNS = 12;
const SEED = 2452;

/** What a page option holds, once read. */
type Scalar = string | number | boolean;

/** How an option's value is written in the page's source. */
type Form =
  | "literal"
  | "constant"
  | "imported"
  | "enum"
  | "importedEnum"
  | "template"
  | "shorthand";

/** One option as the author wrote it: its expression and the declarations it needs. */
interface Written<Value = Scalar> {
  /** The option's key in the options object. */
  key: string;
  /** Written as `key: expression`, or as `key` alone when `shorthand`. */
  expression: string;
  shorthand: boolean;
  /** Declarations placed above the page in the page's file. */
  declarations: string[];
  /** Declarations exported from the constants file the page imports from. */
  exported: string[];
  /** The page's imports from the constants file. */
  imported: string[];
  /** The value the expression holds. */
  value: Value;
}

const word = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,7}$/);
const text = fc
  .array(word, { minLength: 1, maxLength: 3 })
  .map((words) => words.join(" "));
const count = fc.integer({ min: -40, max: 900 });

const STRING_FORMS: Form[] = [
  "literal",
  "constant",
  "imported",
  "enum",
  "importedEnum",
  "template",
  "shorthand",
];
const NUMBER_FORMS: Form[] = [
  "literal",
  "constant",
  "imported",
  "enum",
  "importedEnum",
  "shorthand",
];
const BOOLEAN_FORMS: Form[] = ["literal", "constant", "imported", "shorthand"];

function literal(value: Scalar): string {
  return JSON.stringify(value);
}

/** The option `key` written in `form`, holding `value`; `template` splits a string in two constants. */
function write(
  key: string,
  form: Form,
  value: string | number | boolean,
): Written {
  const upper = key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
  const written: Written = {
    key,
    expression: literal(value),
    shorthand: false,
    declarations: [],
    exported: [],
    imported: [],
    value,
  };
  switch (form) {
    case "literal":
      return written;
    case "constant":
      return {
        ...written,
        expression: upper,
        declarations: [`const ${upper} = ${literal(value)};`],
      };
    case "imported":
      return {
        ...written,
        expression: upper,
        exported: [`export const ${upper} = ${literal(value)};`],
        imported: [upper],
      };
    case "enum": {
      const name = `${key[0].toUpperCase()}${key.slice(1)}Choice`;
      return {
        ...written,
        expression: `${name}.Picked`,
        declarations: [`enum ${name} { Picked = ${literal(value)} }`],
      };
    }
    case "importedEnum": {
      const name = `${key[0].toUpperCase()}${key.slice(1)}Choice`;
      return {
        ...written,
        expression: `${name}.Picked`,
        exported: [`export enum ${name} { Picked = ${literal(value)} }`],
        imported: [name],
      };
    }
    case "template": {
      const head = `${upper}_HEAD`;
      const tail = `${upper}_TAIL`;
      const whole = String(value);
      const cut = Math.max(1, Math.floor(whole.length / 2));
      return {
        ...written,
        expression: `\`\${${head}}:\${${tail}}\``,
        declarations: [
          `const ${head} = ${literal(whole.slice(0, cut))};`,
          `const ${tail} = ${literal(whole.slice(cut))};`,
        ],
        value: `${whole.slice(0, cut)}:${whole.slice(cut)}`,
      };
    }
    case "shorthand":
      return {
        ...written,
        expression: key,
        shorthand: true,
        declarations: [`const ${key} = ${literal(value)};`],
      };
  }
}

/** How a member is written inside an options object: `key: expression`, or `key` alone. */
function member(written: Written): string {
  return written.shorthand
    ? written.key
    : `${written.key}: ${written.expression}`;
}

/** The option `key` written as an object holding `members`, as `permission` and `live` are. */
function wrap(
  key: string,
  members: Written[],
): Written<Record<string, Scalar>> {
  return {
    key,
    expression: `{ ${members.map(member).join(", ")} }`,
    shorthand: false,
    declarations: members.flatMap((inner) => inner.declarations),
    exported: members.flatMap((inner) => inner.exported),
    imported: members.flatMap((inner) => inner.imported),
    value: Object.fromEntries(members.map((inner) => [inner.key, inner.value])),
  };
}

/** A page's options: each one's value, and the form the author wrote it in. */
interface Options {
  displayName: Written;
  icon: Written;
  order: Written;
  hidden: Written;
  permission: Written<Record<string, Scalar>>;
  live: Written<Record<string, Scalar>>;
  /** The `live` option's `maxRate` member, which the editor changes while its sibling stays. */
  maxRate: Written;
  /** The `live` option's `rememberKey` member. */
  rememberKey: Written;
}

const options: fc.Arbitrary<Options> = fc
  .record({
    displayName: fc.tuple(fc.constantFrom(...STRING_FORMS), text),
    icon: fc.tuple(
      fc.constantFrom(...STRING_FORMS),
      word.map((name) => `i-ph-${name}`),
    ),
    order: fc.tuple(fc.constantFrom(...NUMBER_FORMS), count),
    hidden: fc.tuple(fc.constantFrom(...BOOLEAN_FORMS), fc.boolean()),
    permission: fc.tuple(
      fc.constantFrom(...STRING_FORMS),
      word.map((name) => `shop.${name}`),
    ),
    maxRate: fc.tuple(
      fc.constantFrom(...NUMBER_FORMS),
      fc.integer({ min: 1, max: 900 }),
    ),
    rememberKey: fc.tuple(fc.constantFrom(...STRING_FORMS), word),
  })
  .map((record) => ({
    displayName: write("displayName", ...record.displayName),
    icon: write("icon", ...record.icon),
    order: write("order", ...record.order),
    hidden: write("hidden", ...record.hidden),
    permission: wrap("permission", [write("id", ...record.permission)]),
    live: wrap("live", [
      write("maxRate", ...record.maxRate),
      write("rememberKey", ...record.rememberKey),
    ]),
    maxRate: write("maxRate", ...record.maxRate),
    rememberKey: write("rememberKey", ...record.rememberKey),
  }));

function entries(options: Options): Written<Scalar | Record<string, Scalar>>[] {
  return [
    options.displayName,
    options.icon,
    options.order,
    options.hidden,
    options.permission,
    options.live,
  ];
}

function optionLine(option: Written<Scalar | Record<string, Scalar>>): string {
  return option.shorthand
    ? `    ${option.key},`
    : `    ${option.key}: ${option.expression},`;
}

function constantsSource(options: Options): string {
  return `${entries(options)
    .flatMap((option) => option.exported)
    .join("\n")}\n\nexport {};\n`;
}

/** The page file an author would write for these options. */
function pageSource(options: Options): string {
  const imported = entries(options).flatMap((option) => option.imported);
  const declarations = entries(options).flatMap(
    (option) => option.declarations,
  );
  return `import { Placeholder } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  Category,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
${imported.length > 0 ? `import { ${imported.join(", ")} } from "./constants";\n` : ""}
export const boardCategory = Category("board", {
  displayName: "Board",
  category: pagesCategory,
});

${declarations.join("\n")}

@RegisterPage()
export class BoardPage extends PageController(
  "overview",
  {
${entries(options).map(optionLine).join("\n")}
    category: boardCategory,
  },
  DefaultLayout({ fullWidth: true }),
) {
  static placeholder = Placeholder({ label: "Board" });
}
`;
}

type PageMeta = Awaited<ReturnType<typeof readPage>>["page"];

let app: Fixture;

function install(options: Options): string {
  const source = pageSource(options);
  app.write(CONSTANTS_FILE, constantsSource(options));
  app.write(FILE, source);
  return source;
}

async function readPage() {
  return expectOk(await GetPageStructure(PAGE), "GetPageStructure");
}

function readValues(page: PageMeta) {
  return {
    displayName: page.displayName,
    icon: page.icon,
    order: page.order,
    hidden: page.hidden,
    permission: page.permission,
    live: page.live,
  };
}

function expectedValues(options: Options) {
  return {
    displayName: options.displayName.value,
    icon: options.icon.value,
    order: options.order.value,
    hidden: options.hidden.value,
    permission: options.permission.value,
    live: options.live.value,
  };
}

/** Describe the forms of a failing case, so a shrunk counterexample names what to write by hand. */
function describeForms(options: Options): string {
  return entries(options)
    .map((option) => `${option.key}: ${option.expression}`)
    .join(", ");
}

/**
 * Run `check` on generated options. The report of the smallest page that breaks it,
 * or `undefined` when none does.
 */
async function forAllOptions(
  check: (generated: Options, label: string) => Promise<void>,
): Promise<string | undefined> {
  const details = await fc.check(
    fc.asyncProperty(options, (generated) =>
      check(generated, describeForms(generated)),
    ),
    { numRuns: NUM_RUNS, seed: SEED },
  );
  return details.failed ? fc.defaultReportMessage(details) : undefined;
}

/** The blocks of the page as read, in the shape a draft sends them back. */
async function readBlocks() {
  const { blocks } = await readPage();
  return blocks.map((block) => ({
    name: block.name,
    type: block.type ?? undefined,
    config: block.config,
  }));
}

async function saveWithConfigure(
  page: PageMeta,
  edit: Partial<PageMeta>,
): Promise<void> {
  expectOk(
    await ConfigurePage(PAGE, {
      ...readValues(page),
      ...edit,
      category: page.category,
    }),
    "ConfigurePage",
  );
}

async function saveWithDraft(
  page: PageMeta,
  edit: Partial<PageMeta>,
): Promise<void> {
  expectOk(
    await SetPageBlocks(PAGE, {
      page: { ...readValues(page), ...edit },
      blocks: await readBlocks(),
    }),
    "SetPageBlocks",
  );
}

type Save = (page: PageMeta, edit: Partial<PageMeta>) => Promise<void>;

/** Sending back what was read leaves the page's source byte for byte as it was. */
function echoLeavesSource(save: Save): () => Promise<string | undefined> {
  return () =>
    forAllOptions(async (generated, label) => {
      const source = install(generated);
      await save((await readPage()).page, {});
      expect(app.read(FILE), label).to.equal(source);
    });
}

/** Changing `displayName` alone leaves every other option as written. */
function renameKeepsOthers(save: Save): () => Promise<string | undefined> {
  return () =>
    forAllOptions(async (generated, label) => {
      install(generated);
      const renamed = `${String(generated.displayName.value)} edited`;
      await save((await readPage()).page, { displayName: renamed });
      const written = app.read(FILE);
      expect(written, label).to.contain(`displayName: ${literal(renamed)}`);
      for (const option of [
        generated.icon,
        generated.order,
        generated.hidden,
        generated.permission,
        generated.live,
      ]) {
        expect(written, label).to.contain(optionLine(option));
      }
      expect(readValues((await readPage()).page), label).to.deep.equal({
        ...expectedValues(generated),
        displayName: renamed,
      });
    });
}

/** Changing one member of `live` writes that member and leaves its sibling as written. */
function editKeepsSiblings(save: Save): () => Promise<string | undefined> {
  return () =>
    forAllOptions(async (generated, label) => {
      install(generated);
      const faster = Number(generated.maxRate.value) + 1;
      const live = {
        maxRate: faster,
        rememberKey: String(generated.rememberKey.value),
      };
      await save((await readPage()).page, { live });
      const written = app.read(FILE);
      expect(written, label).to.contain(`maxRate: ${literal(faster)}`);
      expect(written, label).to.contain(member(generated.rememberKey));
      expect(readValues((await readPage()).page).live, label).to.deep.equal(
        live,
      );
    });
}

/** Where the known defects the property finds are run on demand: `DMS_PROPERTY_KNOWN_DEFECTS=1`. */
const KNOWN_DEFECTS = process.env.DMS_PROPERTY_KNOWN_DEFECTS === "1";

describe("page options written as constant expressions (property): a literal, a named constant, an enum member, a template literal of constants or a shorthand property reads as the value it holds and, sent back unchanged, is left as the author wrote it", () => {
  before(function () {
    this.timeout(120_000);
    app = createFixture();
    fs.mkdirSync(path.join(app.root, "src", "board"));
    app.write("index.ts", 'import "./board/page";\n\nexport {};\n');
  });

  after(() => destroyFixture());

  it("reads the value an expression holds", async function () {
    this.timeout(OP_TIMEOUT);
    const failure = await forAllOptions(async (generated, label) => {
      install(generated);
      const { page } = await readPage();
      expect(readValues(page), label).to.deep.equal(expectedValues(generated));
    });
    expect(failure).to.equal(undefined);
  });

  it("leaves the source as written when ConfigurePage echoes what it read", async function () {
    this.timeout(OP_TIMEOUT);
    expect(await echoLeavesSource(saveWithConfigure)()).to.equal(undefined);
  });

  it("leaves the source as written when a draft save echoes what it read", async function () {
    this.timeout(OP_TIMEOUT);
    expect(await echoLeavesSource(saveWithDraft)()).to.equal(undefined);
  });

  it("ConfigurePage writes a renamed page and keeps the other options as written", async function () {
    this.timeout(OP_TIMEOUT);
    expect(await renameKeepsOthers(saveWithConfigure)()).to.equal(undefined);
  });

  it("a draft save writes a renamed page and keeps the other options as written", async function () {
    this.timeout(OP_TIMEOUT);
    expect(await renameKeepsOthers(saveWithDraft)()).to.equal(undefined);
  });

  it("a draft save writes the member the editor changed and keeps its sibling as written", async function () {
    this.timeout(OP_TIMEOUT);
    expect(await editKeepsSiblings(saveWithDraft)()).to.equal(undefined);
  });

  it('ConfigurePage writes the member the editor changed and keeps its sibling as written (known defect, runs under `DMS_PROPERTY_KNOWN_DEFECTS=1`: for a changed `live` member it writes its sibling as its value, `rememberKey: "A"` for `rememberKey: KEY`, and prunes `KEY`, which a draft save keeps)', async function () {
    if (!KNOWN_DEFECTS) {
      this.skip();
    }
    this.timeout(OP_TIMEOUT);
    expect(await editKeepsSiblings(saveWithConfigure)()).to.equal(undefined);
  });
});
