import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const root = git("rev-parse", "--show-toplevel").trim();
const area = "packages/dms/frontend-vue";
const require = createRequire(join(root, area, "package.json"));
const ts = require("typescript");
const prettier = require("prettier");
const { parse, compileTemplate } = require("vue/compiler-sfc");
const base = process.argv[2];
assert.ok(base, "Usage: node frontend-comment-emit.mjs <base-ref>");
const head = process.argv.includes("--working")
  ? "WORKTREE"
  : git("rev-parse", "HEAD").trim();
const printer = ts.createPrinter({ removeComments: true });

async function syntaxShape(source, file) {
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  return prettier.format(printer.printFile(parsed), { parser: "typescript" });
}

async function sourceShape(source, file) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  assert.deepEqual(tree.parseDiagnostics, [], `${file}: syntax diagnostics`);
  return {
    syntax: await syntaxShape(source, file),
    javascript: file.endsWith(".d.ts")
      ? null
      : await syntaxShape(
          ts.transpileModule(source, {
            fileName: file,
            compilerOptions: {
              target: ts.ScriptTarget.ESNext,
              module: ts.ModuleKind.ESNext,
              removeComments: true,
              sourceMap: false,
              inlineSourceMap: false,
              newLine: ts.NewLineKind.LineFeed,
            },
          }).outputText,
          `${file}.js`,
        ),
  };
}

async function vueShape(source, file) {
  const { descriptor, errors } = parse(source, { filename: file });
  assert.deepEqual(errors, [], `${file}: SFC parse errors`);
  const scripts = await Promise.all(
    [descriptor.script, descriptor.scriptSetup].map(async (script) =>
      script
        ? {
            attributes: script.attrs,
            ...(await sourceShape(script.content, `${file}.ts`)),
          }
        : null,
    ),
  );
  const template = descriptor.template;
  function render(ssr) {
    if (!template) return null;
    const result = compileTemplate({
      source: template.content,
      filename: file,
      id: "comment-proof",
      ssr,
      ssrCssVars: descriptor.cssVars,
      scoped: descriptor.styles.some((style) => style.scoped),
      compilerOptions: { comments: true, expressionPlugins: ["typescript"] },
    });
    assert.deepEqual(result.errors, [], `${file}: template compile errors`);
    return result.code;
  }
  return {
    scripts,
    templateAttributes: template?.attrs,
    render: render(false),
    ssr: render(true),
    styles: descriptor.styles.map((style) => ({
      attributes: style.attrs,
      content: style.content,
    })),
    custom: descriptor.customBlocks.map((block) => ({
      type: block.type,
      attributes: block.attrs,
      content: block.content,
    })),
  };
}

function files(ref) {
  const paths =
    ref === "WORKTREE"
      ? git(
          "ls-files",
          "--cached",
          "--others",
          "--exclude-standard",
          "--",
          area,
        )
      : git("ls-tree", "-r", "--name-only", ref, "--", area);
  return paths
    .trim()
    .split("\n")
    .filter((file) => /\.(?:[cm]?js|ts|vue|css)$/.test(file))
    .filter((file) => !file.startsWith(`${area}/tests/`))
    .filter((file) => file !== `${area}/scripts/prove-comment-emit.mjs`);
}

const before = files(base);
const after = files(head);
assert.deepEqual(after, before, "Product source file set changed");
for (const file of before) {
  const shape = (ref) => {
    const source =
      ref === "WORKTREE"
        ? readFileSync(join(root, file), "utf8")
        : git("show", `${ref}:${file}`);
    if (file.endsWith(".vue")) return vueShape(source, file);
    if (file.endsWith(".css")) return source;
    return sourceShape(source, file);
  };
  assert.deepEqual(
    await shape(head),
    await shape(base),
    `${file}: non-comment source or emit changed`,
  );
}
console.log(
  `Frontend comment emit proof: ${before.length} product files unchanged against ${base} (${head === "WORKTREE" ? "working tree" : `committed HEAD ${head}`}).`,
);
