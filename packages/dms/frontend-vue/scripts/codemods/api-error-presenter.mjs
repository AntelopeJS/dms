import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  apiErrorSources,
  apiErrorScripts,
  analyzeApiErrorScript,
} from "../check-api-error-presentation.mjs";

const require = createRequire(resolve(process.cwd(), "package.json"));
const tools = {
  ts: require("typescript"),
  parse: require("vue/compiler-sfc").parse,
};
const { ts } = tools;

function translatedKey(expression) {
  if (
    !expression ||
    !ts.isCallExpression(expression) ||
    !["t", "processI18n"].includes(expression.expression.getText())
  )
    return null;
  const key = expression.arguments[0];
  return expression.arguments.length === 1 && key && ts.isStringLiteral(key)
    ? key.text
    : null;
}

function literalKey(payload) {
  if (!payload || !ts.isObjectLiteralExpression(payload)) return null;
  const allowed = new Set(["title", "description", "color", "icon"]);
  if (
    payload.properties.some(
      (property) =>
        !ts.isPropertyAssignment(property) ||
        !allowed.has(property.name.getText()) ||
        (["title", "description"].includes(property.name.getText())
          ? translatedKey(property.initializer) === null
          : !(
              ts.isStringLiteral(property.initializer) ||
              (property.name.getText() === "color" &&
                /^Color\.(error|warning|info)$/.test(
                  property.initializer.getText(),
                ))
            )),
    )
  )
    return null;
  const title =
    payload.properties.find(
      (property) => property.name.getText() === "description",
    )?.initializer ??
    payload.properties.find((property) => property.name.getText() === "title")
      ?.initializer;
  return translatedKey(title);
}

function composableScope(node) {
  let outer = null;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      (ts.isFunctionDeclaration(parent) ||
        ts.isFunctionExpression(parent) ||
        ts.isArrowFunction(parent)) &&
      ts.isBlock(parent.body)
    )
      outer = parent;
  }
  const name = outer?.name ?? outer?.parent?.name;
  return name && ts.isIdentifier(name) && /^use[A-Z]/.test(name.text)
    ? outer.body
    : null;
}

/** Rewrites supported setup/composable catches and returns unsupported cases. */
export function migrateApiErrorSource(file, source) {
  const edits = [];
  const manual = [];
  for (const script of apiErrorScripts(file, source, tools)) {
    const calls = analyzeApiErrorScript(script.source, file, ts);
    let capture = false;
    for (const call of calls) {
      const fallbackKey = literalKey(call.payload);
      const standalone = ts.isExpressionStatement(call.node.parent);
      const safeCatch = call.failure && /^[A-Za-z_$][\w$]*$/.test(call.failure);
      const collision = /\b(?:presentError|useApiErrorPresenter)\b/.test(
        script.source,
      );
      const hasSetup = file.endsWith(".vue")
        ? script.isSetup
        : composableScope(call.node);
      if (
        fallbackKey &&
        standalone &&
        safeCatch &&
        hasSetup &&
        call.method === "add" &&
        !collision
      ) {
        edits.push({
          start: script.offset + call.node.getStart(),
          end: script.offset + call.node.end,
          text: `presentError(${call.failure}, { fallbackKey: ${JSON.stringify(fallbackKey)} })`,
        });
        capture = true;
      } else {
        manual.push({
          file,
          line: source
            .slice(0, script.offset + call.node.getStart())
            .split("\n").length,
          reason: "manual-error-presentation",
          expression: call.node.getText(call.tree),
        });
      }
    }
    if (capture) {
      const tree = ts.createSourceFile(
        file,
        script.source,
        ts.ScriptTarget.Latest,
        true,
      );
      const imports = tree.statements.filter(ts.isImportDeclaration);
      const offset = imports.at(-1)?.end ?? 0;
      const declaration = file.endsWith(".vue")
        ? "\nconst { presentError } = useApiErrorPresenter();\n"
        : `\nimport { useApiErrorPresenter } from "#dms-core/app/composables/useApiErrorPresenter";\n`;
      if (file.endsWith(".vue"))
        edits.push({
          start: script.offset + offset,
          end: script.offset + offset,
          text: declaration,
        });
      else {
        const scopes = new Set();
        for (const call of calls) {
          if (
            !edits.some(
              (edit) => edit.start === script.offset + call.node.getStart(),
            )
          )
            continue;
          const outer = composableScope(call.node);
          if (outer) scopes.add(outer.getStart() + 1);
        }
        for (const start of scopes)
          edits.push({
            start: script.offset + start,
            end: script.offset + start,
            text: "\nconst { presentError } = useApiErrorPresenter();\n",
          });
        edits.push({
          start: script.offset + offset,
          end: script.offset + offset,
          text: declaration,
        });
      }
    }
  }
  let output = source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return { output, rewritten: output !== source, manual };
}

/** Dry-run by default; writes only source cases accepted by the bounded migration. */
export function migrateApiErrorFile(file, write = false) {
  const result = migrateApiErrorSource(file, readFileSync(file, "utf8"));
  if (write && result.rewritten) writeFileSync(file, result.output);
  return result;
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  const roots = process.argv
    .slice(2)
    .filter((argument) => argument !== "--write");
  if (!roots.length)
    throw new Error(
      "Pass app directories. Add --write to apply safe rewrites. Manual cases are JSONL on stdout.",
    );
  for (const file of roots.flatMap(apiErrorSources)) {
    const result = migrateApiErrorFile(file, process.argv.includes("--write"));
    for (const entry of result.manual)
      process.stdout.write(`${JSON.stringify(entry)}\n`);
    if (result.rewritten)
      process.stderr.write(
        `${process.argv.includes("--write") ? "rewrote" : "would rewrite"} ${file}\n`,
      );
  }
}
