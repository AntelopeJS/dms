/** The kinds of top-level binding a module holds. */
export const BINDING_KINDS = ["const", "enum", "class", "merged", "overload", "object", "arrayOfConst", "typedObject", "arrayLiteral"] as const;
export type BindingKind = (typeof BINDING_KINDS)[number];

/** One choice of the generator: a kind, how many names a destructuring binds, and which earlier names each read picks. */
export interface BindingRecipe {
  kind: BindingKind;
  names: number;
  picks: readonly (readonly number[])[];
}

/**
 * A generated module that an option patch rewrites, with the bindings its
 * option value reads. The module holds the reads as a graph, so the expected
 * result of the prune comes from the graph, not from the code under check.
 *
 * What the generator draws: the bindings, and who reads which of them.
 */
export interface ModuleRecipe {
  bindings: readonly BindingRecipe[];
  oldPicks: readonly number[];
  keepPicks: readonly number[];
  otherPicks: readonly number[];
  /** The option is written `{ displayName }` and reads the one constant of that name. */
  shorthand: boolean;
  /** Exported members and interface properties spelled like each local. */
  decoyMembers: boolean;
  /** The old value also holds a function whose parameter is spelled like the first constant, which reads no local. */
  shadow: boolean;
  /** An author's local that nothing reads stays; when false, a reader is added for each. */
  unusedStay: boolean;
}

/** A name a module declares, how to read it in an expression, and which names its declaration reads. */
export interface DeclaredName {
  name: string;
  expression: string;
  reads: string[];
  /** Whether a later binding or the option may read it in an expression: a type, or a value that is no string, may not. */
  readable: boolean;
}

/** A top-level statement of a module, written with the names that are still bound. */
export interface ModuleStatement {
  names: string[];
  text(alive: ReadonlySet<string>): string;
}

/** The module, its graph of reads and the readers that stay or go with the patch. */
export interface BuiltModule {
  declared: ReadonlyMap<string, DeclaredName>;
  /** The names the replaced option value reads. */
  oldReads: readonly string[];
  /** The names that the exports and the option's other members read, and keep reading after the patch. */
  fixedReads: readonly string[];
  /** The module's top-level statements, in order, once the names in `alive` are bound and the option holds the old or the new value. */
  render(alive: ReadonlySet<string>, patched: boolean): string[];
}

const READ_LIMIT = 2;
/** What the patch writes in place of the old value. */
export const NEW_TITLE = "Shop board";

function resolve(names: readonly DeclaredName[], picks: readonly number[]): DeclaredName[] {
  return names.length === 0 ? [] : picks.map((at) => names[at % names.length]).filter((found) => found !== undefined);
}

function concatenation(literal: string, reads: readonly string[]): string {
  return [JSON.stringify(literal), ...reads].join(" + ");
}

/** What each binding's builder reads and writes while a module is built. */
interface Builder {
  declared: Map<string, DeclaredName>;
  statements: ModuleStatement[];
  /** The names an expression may read now. */
  earlier(): DeclaredName[];
  declare(name: string, expression: string, reads: readonly DeclaredName[], readable?: boolean): void;
}

/** A name that nothing may read in an expression, such as a type or a list. */
function hidden(name: string): DeclaredName {
  return { name, expression: name, reads: [], readable: false };
}

/** The earlier names that a binding's `at`-th read picks. */
function readsAt(builder: Builder, binding: BindingRecipe, at: number): DeclaredName[] {
  return resolve(builder.earlier(), (binding.picks[at] ?? []).slice(0, READ_LIMIT));
}

type BindingBuilder = (builder: Builder, binding: BindingRecipe, index: number) => void;

function singleName(builder: Builder, name: string, expression: string, reads: readonly DeclaredName[], text: string): void {
  builder.declare(name, expression, reads);
  builder.statements.push({ names: [name], text: () => text });
}

/** The builder of each kind of binding. */
const BUILDERS: Record<BindingKind, BindingBuilder> = {
  const: (builder, binding, index) => {
    const name = `c${index}`;
    const reads = readsAt(builder, binding, 0);
    singleName(builder, name, name, reads, `const ${name} = ${concatenation(name, reads.map((read) => read.expression))};`);
  },
  enum: (builder, _binding, index) => {
    const name = `E${index}`;
    singleName(builder, name, `${name}.A`, [], `enum ${name} {\n  A = "A",\n}`);
  },
  class: (builder, binding, index) => {
    const name = `K${index}`;
    const reads = readsAt(builder, binding, 0);
    singleName(builder, name, `${name}.v`, reads, `class ${name} {\n  static v = ${concatenation(name, reads.map((read) => read.expression))};\n}`);
  },
  merged: (builder, _binding, index) => {
    const name = `S${index}`;
    singleName(builder, name, `({ row: "r", col: 1 } satisfies ${name}).row`, [], `interface ${name} {\n  row: string;\n}\ninterface ${name} {\n  col: number;\n}`);
  },
  overload: (builder, binding, index) => {
    const name = `f${index}`;
    const reads = readsAt(builder, binding, 0);
    const returned = ["String(value)", ...reads.map((read) => read.expression)].join(" + ");
    singleName(
      builder,
      name,
      `${name}("x")`,
      reads,
      `function ${name}(value: string): string;\nfunction ${name}(value: number): string;\nfunction ${name}(value: unknown): string {\n  return ${returned};\n}`,
    );
  },
  object: (builder, binding, index) => {
    const members = Array.from({ length: Math.max(2, binding.names) }, (_, at) => ({ name: `d${index}x${at}`, reads: readsAt(builder, binding, at) }));
    for (const member of members) builder.declare(member.name, member.name, member.reads);
    builder.statements.push({
      names: members.map((member) => member.name),
      text: (alive) => {
        const kept = members.filter((member) => alive.has(member.name));
        const literal = kept.map((member) => `${member.name}: ${concatenation(member.name, member.reads.map((read) => read.expression))}`).join(", ");
        return `const { ${kept.map((member) => member.name).join(", ")} } = { ${literal} };`;
      },
    });
  },
  arrayOfConst: (builder, binding, index) => {
    const list = `l${index}`;
    const names = Array.from({ length: Math.max(2, binding.names) }, (_, at) => `d${index}y${at}`);
    builder.declare(list, list, [], false);
    builder.statements.push({ names: [list], text: () => `const ${list} = [${names.map((_, at) => JSON.stringify(`item${at}`)).join(", ")}];` });
    for (const name of names) builder.declare(name, name, [hidden(list)]);
    builder.statements.push({ names, text: (alive) => `const [${patternOf(names, alive)}] = ${list};` });
  },
  typedObject: (builder, _binding, index) => {
    const contract = `T${index}`;
    const source = `t${index}`;
    const names = Array.from({ length: 2 }, (_, at) => `d${index}t${at}`);
    builder.declare(contract, contract, [], false);
    builder.statements.push({ names: [contract], text: () => `interface ${contract} {\n${names.map((name) => `  ${name}: string;`).join("\n")}\n}` });
    builder.declare(source, source, [hidden(contract)], false);
    builder.statements.push({ names: [source], text: () => `const ${source}: ${contract} = { ${names.map((name) => `${name}: ${JSON.stringify(name)}`).join(", ")} };` });
    for (const name of names) builder.declare(name, name, [hidden(source)]);
    builder.statements.push({ names, text: (alive) => `const { ${names.filter((name) => alive.has(name)).join(", ")} } = ${source};` });
  },
  arrayLiteral: (builder, binding, index) => {
    const members = Array.from({ length: Math.max(2, binding.names) }, (_, at) => ({ name: `d${index}z${at}`, reads: readsAt(builder, binding, at) }));
    const elementReads = members.flatMap((member) => member.reads);
    for (const member of members) builder.declare(member.name, member.name, elementReads);
    const literal = `[${members.map((member) => concatenation(member.name, member.reads.map((read) => read.expression))).join(", ")}]`;
    const names = members.map((member) => member.name);
    builder.statements.push({ names, text: (alive) => `const [${patternOf(names, alive)}] = ${literal};` });
  },
};

/** The elements of an array pattern: a name that is still bound, a hole for one that is not, and no hole at the end. */
function patternOf(names: readonly string[], alive: ReadonlySet<string>): string {
  const last = names.findLastIndex((name) => alive.has(name));
  return names
    .slice(0, last + 1)
    .map((name) => (alive.has(name) ? name : ""))
    .join(", ");
}

/**
 * Builds the module a recipe describes.
 *
 * @param recipe What the generator drew.
 * @returns The module and its graph of reads.
 */
export function buildModule(recipe: ModuleRecipe): BuiltModule {
  const declared = new Map<string, DeclaredName>();
  const builder: Builder = {
    declared,
    statements: [],
    earlier: () => [...declared.values()].filter((entry) => entry.readable),
    declare: (name, expression, reads, readable = true) => {
      declared.set(name, { name, expression, reads: reads.map((read) => read.name), readable });
    },
  };
  if (recipe.shorthand) {
    builder.declare("displayName", "displayName", []);
    builder.statements.push({ names: ["displayName"], text: () => 'const displayName = "Board";' });
  }
  recipe.bindings.forEach((binding, index) => BUILDERS[binding.kind](builder, binding, index));
  return withReaders(recipe, builder);
}

/** The module once its option, its exports and its decoys are written over the bindings. */
function withReaders(recipe: ModuleRecipe, builder: Builder): BuiltModule {
  const { declared, statements } = builder;
  const readable = builder.earlier();
  const every = [...declared.values()];
  const oldReads = recipe.shorthand ? ["displayName"] : resolve(readable, recipe.oldPicks.slice(0, READ_LIMIT + 1)).map((read) => read.name);
  const otherReads = resolve(readable, recipe.otherPicks.slice(0, READ_LIMIT)).map((read) => read.name);
  const keepReads = resolve(readable, recipe.keepPicks).map((read) => read.name);
  if (!recipe.unusedStay) {
    const read = new Set([...oldReads, ...otherReads, ...keepReads, ...every.flatMap((entry) => entry.reads)]);
    keepReads.push(...every.filter((entry) => !read.has(entry.name)).map((entry) => entry.name));
  }
  const expressionFor = (name: string): string => declared.get(name)?.expression ?? name;
  const shadowed = readable.find((entry) => /^c\d+$/.test(entry.name))?.name;
  const shadowText = recipe.shadow && shadowed !== undefined && !recipe.shorthand ? ` + ((${shadowed}: string) => ${shadowed})("x")` : "";
  const decoys = recipe.decoyMembers
    ? readable
        .filter((entry) => /^c\d+$/.test(entry.name) || /^d\d+x\d+$/.test(entry.name))
        .flatMap((entry) => [`export class Holder_${entry.name} {\n  static ${entry.name} = 1;\n}`, `export interface Contract_${entry.name} {\n  ${entry.name}: string;\n}`])
    : [];
  const keepText = `export const keep = [${keepReads.map(expressionFor).join(", ")}];`;
  const otherValue = concatenation("other", otherReads.map(expressionFor));
  const pageText = (patched: boolean): string => {
    let displayName = `displayName: ${concatenation("Board", oldReads.map(expressionFor))}${shadowText},`;
    if (recipe.shorthand) displayName = "displayName,";
    if (patched) displayName = `displayName: ${JSON.stringify(NEW_TITLE)},`;
    return `export const page = {\n  id: "board",\n  ${displayName}\n  title: ${otherValue},\n};`;
  };
  return {
    declared,
    oldReads,
    fixedReads: [...keepReads, ...otherReads],
    render: (alive, patched) => [
      ...statements.filter((statement) => statement.names.some((name) => alive.has(name))).map((statement) => statement.text(alive)),
      ...decoys,
      keepText,
      pageText(patched),
    ],
  };
}

/**
 * The names the prune must leave. A name stays unless something read it before
 * the patch and nothing reads it after; a name nothing read is the author's.
 * The old value's reads end with the patch, and a name's own reads end with
 * the name.
 *
 * @param module The built module.
 * @returns The names that survive the patch.
 */
export function survivors(module: BuiltModule): Set<string> {
  const readBy = (name: string, alive: ReadonlySet<string>, withOld: boolean): boolean =>
    module.fixedReads.includes(name) ||
    (withOld && module.oldReads.includes(name)) ||
    [...alive].some((other) => other !== name && module.declared.get(other)?.reads.includes(name));
  const everything = new Set(module.declared.keys());
  const usedBefore = new Set([...everything].filter((name) => readBy(name, everything, true)));
  const alive = new Set(everything);
  let orphan = [...alive].find((name) => usedBefore.has(name) && !readBy(name, alive, false));
  while (orphan !== undefined) {
    alive.delete(orphan);
    orphan = [...alive].find((name) => usedBefore.has(name) && !readBy(name, alive, false));
  }
  return alive;
}
