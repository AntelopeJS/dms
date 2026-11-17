import fc from "fast-check";
import { runProperties, rule, type PropertyCheck } from "../../formal/run-properties.cjs";
import { applyPatch } from "../../../packages/dms/src/implementations/dms-builder/engine/options-patch";
import { Project, SyntaxKind, ts, type SourceFile } from "../../../packages/dms/node_modules/ts-morph";
import { BINDING_KINDS, NEW_TITLE, buildModule, survivors, type BindingKind, type BindingRecipe, type ModuleRecipe } from "./module-model.cjs";

const project = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: { strict: true, noUnusedLocals: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, skipLibCheck: true, types: [] },
});

/** The text with its whitespace folded and the commas that end an array pattern dropped, which bind the same names with or without. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").replace(/(?:, ?)+\]/g, "]").trim();
}

/** The names of the top-level bindings of a file. */
function boundNames(file: SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of file.getVariableStatements()) {
    for (const declaration of statement.getDeclarations()) {
      const name = declaration.getNameNode();
      if (name.getKind() === SyntaxKind.Identifier) names.add(name.getText());
      else for (const element of name.getDescendantsOfKind(SyntaxKind.BindingElement)) names.add(element.getNameNode().getText());
    }
  }
  for (const node of [...file.getFunctions(), ...file.getClasses(), ...file.getEnums(), ...file.getInterfaces()]) {
    const name = node.getName();
    if (name !== undefined) names.add(name);
  }
  return names;
}

/** The messages of the file's diagnostics. */
function messagesOf(file: SourceFile): string[] {
  return file.getPreEmitDiagnostics().map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.compilerObject.messageText, " "));
}

const cache = new Map<string, Outcome>();

interface Outcome {
  before: string[];
  after: string[];
  actual: Set<string>;
  expected: Set<string>;
  expectedText: string;
  actualText: string;
}

function evaluate(recipe: ModuleRecipe): Outcome {
  const key = JSON.stringify(recipe);
  const known = cache.get(key);
  if (known !== undefined) return known;
  const module = buildModule(recipe);
  const everything = new Set(module.declared.keys());
  const file = project.createSourceFile("/page.ts", module.render(everything, false).join("\n\n") + "\n", { overwrite: true });
  const before = messagesOf(file);
  const options = file.getVariableDeclarationOrThrow("page").getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  applyPatch(options, { displayName: NEW_TITLE }, false, { addImport: () => undefined });
  const expected = survivors(module);
  const outcome = {
    before,
    after: messagesOf(file),
    actual: new Set([...boundNames(file)].filter((name) => everything.has(name))),
    expected,
    expectedText: normalize(module.render(expected, true).join("\n\n")),
    actualText: normalize(file.getFullText()),
  };
  cache.set(key, outcome);
  return outcome;
}

const picks = fc.array(fc.nat(40), { maxLength: 3 });
function bindingOf(kinds: readonly BindingKind[]): fc.Arbitrary<BindingRecipe> {
  return fc.record({
    kind: fc.constantFrom(...kinds),
    names: fc.integer({ min: 2, max: 3 }),
    picks: fc.array(picks, { minLength: 3, maxLength: 3 }),
  });
}

/** The kinds whose names the prune removes one at a time. */
const PRUNED_KINDS = BINDING_KINDS.filter((kind) => kind !== "arrayLiteral");

/** A module: up to nine bindings, an option value that reads some, and other readers that stay. */
function recipes(unusedStay: boolean, kinds: readonly BindingKind[] = PRUNED_KINDS): fc.Arbitrary<ModuleRecipe> {
  return fc.record({
    bindings: fc.array(bindingOf(kinds), { maxLength: 9 }),
    oldPicks: picks,
    keepPicks: fc.array(fc.nat(40), { maxLength: 3 }),
    otherPicks: fc.array(fc.nat(40), { maxLength: 2 }),
    shorthand: fc.boolean(),
    decoyMembers: fc.boolean(),
    shadow: fc.boolean(),
    unusedStay: fc.constant(unusedStay),
  });
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((name) => right.has(name));
}

const rules: readonly PropertyCheck[] = [
  rule(
    "PatchTypechecksUnderNoUnusedLocals",
    fc.property(recipes(false), (recipe) => {
      const { before, after } = evaluate(recipe);
      if (before.length > 0) throw new Error(`the generated module does not typecheck: ${before.join("; ")}`);
      return after.length === 0;
    }),
  ),
  rule(
    "PatchRemovesExactlyTheOrphans",
    fc.property(recipes(true), (recipe) => {
      const { actual, expected } = evaluate(recipe);
      return sameSet(actual, expected);
    }),
  ),
  rule(
    "PatchChangesNoOtherDeclaration",
    fc.property(recipes(true), (recipe) => {
      const { expectedText, actualText } = evaluate(recipe);
      return expectedText === actualText;
    }),
  ),
  rule(
    "PatchPrunesOrphanedArrayLiteralNames",
    fc.property(recipes(false, ["const", "arrayLiteral"]), (recipe) => {
      const { before, after } = evaluate(recipe);
      if (before.length > 0) throw new Error(`the generated module does not typecheck: ${before.join("; ")}`);
      return after.length === 0;
    }),
  ),
];

/** The rules that break on the code today. */
const FINDINGS: ReadonlySet<string> = new Set(["PatchPrunesOrphanedArrayLiteralNames"]);

runProperties(rules, FINDINGS, process.argv.slice(2), { ci: 300, full: 5000 });
