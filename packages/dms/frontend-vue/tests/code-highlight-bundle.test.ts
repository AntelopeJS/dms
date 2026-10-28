import { resolve } from "node:path";
import { build, type Rollup } from "vite";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const HIGHLIGHTER = resolve(
  ROOT,
  "layers/dms-ui/app/build/utils/codeHighlight.ts",
);
const BUILD_TIMEOUT_MS = 60_000;

type Chunk = Rollup.OutputChunk;

let chunks: Map<string, Chunk>;
let entry: Chunk;

function closure(start: Chunk): Chunk[] {
  const seen = new Map<string, Chunk>();
  const visit = (chunk: Chunk) => {
    if (seen.has(chunk.fileName)) return;
    seen.set(chunk.fileName, chunk);
    for (const name of chunk.imports) visit(chunks.get(name)!);
  };
  visit(start);
  return [...seen.values()];
}

const modulesOf = (loaded: Chunk[]) =>
  loaded.flatMap((chunk) => Object.keys(chunk.modules));

function modulesLoadedFor(facade: RegExp): string[] {
  const loaded = closure(entry)
    .flatMap((chunk) => chunk.dynamicImports)
    .map((name) => chunks.get(name)!)
    .filter((chunk) => facade.test(chunk.facadeModuleId ?? ""))
    .flatMap(closure);
  expect(loaded.length, `no chunk loads ${facade}`).toBeGreaterThan(0);
  return modulesOf(loaded);
}

const PACKAGE_OF = /.*node_modules\/((?:@[^/]+\/)?[^/]+)\//;

const packagesIn = (modules: string[]) =>
  new Set(
    modules
      .map((id) => PACKAGE_OF.exec(id)?.[1])
      .filter((name): name is string => !!name),
  );

const EDITOR_PACKAGES = [
  "@codemirror/view",
  "@codemirror/state",
  "@codemirror/language",
  "@codemirror/autocomplete",
];

beforeAll(async () => {
  const output = (await build({
    configFile: false,
    root: ROOT,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      rollupOptions: {
        input: HIGHLIGHTER,
        preserveEntrySignatures: "strict",
      },
    },
  })) as Rollup.RollupOutput;
  const built = output.output.filter(
    (item): item is Chunk => item.type === "chunk",
  );
  chunks = new Map(built.map((chunk) => [chunk.fileName, chunk]));
  entry = built.find((chunk) => chunk.isEntry)!;
}, BUILD_TIMEOUT_MS);

describe("the read-only highlighter's bundle", () => {
  it("loads no CodeMirror package before a language is asked for", () => {
    const packages = packagesIn(modulesOf(closure(entry)));
    expect(
      [...packages].filter((name) => name.startsWith("@codemirror/")),
    ).toEqual([]);
  });

  it.each([
    ["json", /@lezer\/json\//, ["@lezer/json"]],
    [
      "javascript and typescript",
      /@lezer\/javascript\//,
      ["@lezer/javascript"],
    ],
    [
      "html",
      /htmlGrammar\.ts$/,
      ["@lezer/html", "@lezer/css", "@lezer/javascript"],
    ],
    [
      "shell",
      /(streamHighlight|shellParser)\.ts$/,
      ["@codemirror/streamparser"],
    ],
  ])(
    "loads only the grammar of %s, never the editor",
    (_language, facade, grammars) => {
      const packages = packagesIn(modulesLoadedFor(facade));
      for (const grammar of grammars) expect(packages).toContain(grammar);
      for (const name of EDITOR_PACKAGES) expect(packages).not.toContain(name);
    },
  );

  it("loads the editor's language only for SQL, whose grammar ships in it", () => {
    const packages = packagesIn(modulesLoadedFor(/lang-sql\//));
    expect(packages).toContain("@codemirror/lang-sql");
  });
});
