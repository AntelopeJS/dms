/** The mapping from DMS data types to column types, and the resource code that follows from it. */

import type {
  CreateResourceInput,
  DataTypeValue,
  FieldSpec,
  ImportRef,
  OpWarning,
  ResourceRoute,
} from "@antelopejs/interface-dms-builder";
import { relativeModule } from "./emit";
import { propertyKey } from "./paths";
import { isNumber, isString } from "./scalar-guards";
import { indentationText, resolveProjectRoot } from "./project";
import {
  createImportCollector,
  type EmitContext,
  serializeValue,
} from "./value";
import {
  DATA_API_MODULE_ORDER,
  DATABASE_LOCAL,
  DATABASE_MODULE_ORDER,
  DbType,
  DECORATOR_IMPORTS,
  type DecoratorSymbol,
  mappedDbType,
  ResourceNames,
  routeMapExpr,
} from "./resource-emit";
import { CORE_SCHEMA_IDENTIFIER } from "./resource-index";
export function dbTypeFor(dataType: DataTypeValue): DbType {
  const known = mappedDbType(dataType);
  if (known) {
    return { ...known, field: JSON.stringify(known.field), fallback: false };
  }
  return { field: JSON.stringify("string"), ts: "string", fallback: true };
}

function fallbackWarning(field: FieldSpec, dbType: DbType): OpWarning[] {
  if (!dbType.fallback) {
    return [];
  }
  return [
    {
      code: "datatype_fallback",
      message: `field "${field.name}" dataType "${field.dataType.$dataType}" has no DB-type mapping; defaulting @Field("string")`,
    },
  ];
}

export function decoratorImport(name: DecoratorSymbol): ImportRef {
  return { name, module: DECORATOR_IMPORTS[name] };
}

interface CollectedImport {
  name: string;
  module?: string;
  targetFile?: string;
}

class ImportSet {
  private readonly refs: CollectedImport[] = [];

  public add(name: string, module: string | undefined): void {
    this.refs.push({ name: name.split(".")[0], module });
  }

  public addSymbol(name: DecoratorSymbol): void {
    this.add(name, DECORATOR_IMPORTS[name]);
  }

  public addRef(ref: ImportRef): void {
    this.refs.push({
      name: ref.name.split(".")[0],
      module: ref.module,
      targetFile: ref.targetFile,
    });
  }

  public render(order: string[], selfPath: string): string {
    const modules = new Map<string, Set<string>>();
    for (const ref of this.refs) {
      const specifier = ref.module ?? this.relative(selfPath, ref.targetFile);
      if (specifier === undefined) {
        continue;
      }
      const set = modules.get(specifier) ?? new Set<string>();
      set.add(ref.name);
      modules.set(specifier, set);
    }
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const module of order) {
      const names = modules.get(module);
      if (!names || names.size === 0) {
        continue;
      }
      seen.add(module);
      lines.push(this.line(module, names));
    }
    for (const [module, names] of [...modules.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (seen.has(module) || names.size === 0) {
        continue;
      }
      lines.push(this.line(module, names));
    }
    return lines.join("\n");
  }

  private relative(selfPath: string, targetFile?: string): string | undefined {
    if (!targetFile || targetFile === selfPath) {
      return undefined;
    }
    return relativeModule(selfPath, targetFile);
  }

  private line(module: string, names: Set<string>): string {
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    return `import { ${sorted.join(", ")} } from ${JSON.stringify(module)};`;
  }
}

function coerceSeeds(seeds: Seeds, fields: FieldSpec[]): Seeds {
  const dateFields = new Set(
    fields
      .filter((field) => dbTypeFor(field.dataType).ts === "Date")
      .map((field) => field.name),
  );
  if (dateFields.size === 0) {
    return seeds;
  }
  return seeds.map((seed) => {
    const out: Seeds[number] = {};
    for (const [key, value] of Object.entries(seed)) {
      out[key] =
        dateFields.has(key) && (isString(value) || isNumber(value))
          ? { $expr: `new Date(${JSON.stringify(value)})` }
          : value;
    }
    return out;
  });
}

function idTableFieldText(): string {
  return fieldDeclaration(['@Field("string")'], "_id: string");
}

function idDataApiFieldText(): string {
  return fieldDeclaration(
    ["@Select()", "@Listable()", "@Access(AccessMode.ReadOnly)"],
    "_id: string",
  );
}

const INLINE_DECLARATION_LIMIT = 80;

/**
 * A field reads the way the DMS's own resources are written: a short stack
 * stays on one line, a longer one takes a line per decorator rather than
 * running off the screen, and a decorator whose own argument object is long
 * breaks across lines too.
 *
 * The form returned carries no leading indent of its own — only the nested
 * lines inside a broken-out argument are indented relative to it. Replacing a
 * property indents the block it inserts; a file built as raw text runs the
 * result through {@link indentDeclaration} instead. Widths are still measured
 * as if one indent were there, so the decision matches how it will read.
 */
function fieldDeclaration(decorators: string[], declaration: string): string {
  const indent = indentationText(resolveProjectRoot());
  const inline = `${decorators.join(" ")} declare ${declaration};`;
  if (indent.length + inline.length <= INLINE_DECLARATION_LIMIT) {
    return inline;
  }
  const lines = decorators.flatMap((decorator) =>
    wrapDecorator(decorator, indent),
  );
  lines.push(`declare ${declaration};`);
  return lines.join("\n");
}

/** Indent a declaration's every line, for a file built as raw text. */
function indentDeclaration(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? line : `${indent}${line}`))
    .join("\n");
}

/**
 * One decorator, as one line or as a broken-out object argument. Splitting on
 * the top-level commas of `@Column({ ... })` keeps a nested object or array
 * argument on its own line rather than cutting through it.
 */
function wrapDecorator(decorator: string, indent: string): string[] {
  const opening = decorator.indexOf("({ ");
  if (
    indent.length + decorator.length <= INLINE_DECLARATION_LIMIT ||
    opening === -1 ||
    !decorator.endsWith(" })")
  ) {
    return [decorator];
  }
  const head = decorator.slice(0, opening);
  const body = decorator.slice(opening + 3, -3);
  const parts = splitTopLevel(body);
  if (parts.length < 2) {
    return [decorator];
  }
  return [`${head}({`, ...parts.map((part) => `${indent}${part},`), "})"];
}

/** Split on commas that sit outside any bracket or string. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\") {
        index++;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "(" || char === "[" || char === "{") {
      depth++;
    } else if (char === ")" || char === "]" || char === "}") {
      depth--;
    } else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) {
    parts.push(tail);
  }
  return parts;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** A property name as a class declares it: bare where it can be, quoted otherwise. */
function propertyName(name: string): string {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

/** A field's declaration in the Table class, the symbols it needs and what it warns of. */
export interface TableFieldText {
  text: string;
  symbols: DecoratorSymbol[];
  warnings: OpWarning[];
}

/** A field's declaration in the DataAPI class and the symbols it needs. */
export interface DataApiFieldText {
  text: string;
  symbols: DecoratorSymbol[];
}

/** A generated file's text and the warnings raised while writing it. */
export interface EmittedFile {
  text: string;
  warnings: OpWarning[];
}

type Seeds = NonNullable<CreateResourceInput["seeds"]>;

/**
 * The Table class declaration for one field.
 *
 * Decorators read off the existing column are written back before `@Field`,
 * where they were: a `@Localized()` dropped here changes how the column is
 * stored and empties it at runtime. A declaration read off the table wins over
 * the DataType mapping, because the builder only maps a few DataTypes and
 * narrowing an existing column to `string` would change the schema behind the
 * author's back.
 */
export function tableFieldText(field: FieldSpec): TableFieldText {
  const symbols: DecoratorSymbol[] = ["Field"];
  const decorators: string[] = [];
  if (field.indexed) {
    decorators.push("@Index()");
    symbols.push("Index");
  }
  decorators.push(...(field.dbField?.decorators ?? []));
  const db = field.dbField
    ? { ...field.dbField, fallback: false }
    : dbTypeFor(field.dataType);
  decorators.push(`@Field(${db.field})`);
  const optional = field.dbField?.optional ? "?" : "";
  return {
    text: fieldDeclaration(
      decorators,
      `${propertyName(field.name)}${optional}: ${db.ts}`,
    ),
    symbols,
    warnings: fallbackWarning(field, db),
  };
}

/**
 * The Data API class declaration for one field.
 *
 * `@Exported` sits between `@Listable` and `@Column`, where the DMS's own
 * resources put it: emitting it further down reorders the stack of every field
 * it rewrites. The TypeScript type is the one the table carries; deriving it
 * from the DataType mapping would narrow a hand-written column to the `string`
 * fallback here while the table keeps its real type, so the two classes would
 * declare different types for one column.
 */
export function dataApiFieldText(
  field: FieldSpec,
  ctx: EmitContext,
): DataApiFieldText {
  const symbols: DecoratorSymbol[] = [];
  const decorators: string[] = [];
  const listable = field.listable !== false;
  if (field.searchable) {
    decorators.push("@Searchable()");
    symbols.push("Searchable");
  }
  if (field.selectable) {
    decorators.push("@Select()");
    symbols.push("Select");
  }
  if (listable) {
    decorators.push("@Listable()");
    symbols.push("Listable");
  }
  if (field.exported) {
    decorators.push("@Exported()");
    symbols.push("Exported");
  }
  const columnParts = [
    `name: ${JSON.stringify(field.label ?? field.name)}`,
    `type: ${serializeValue(field.dataType, ctx)}`,
  ];
  if (field.filterable && !field.archiveField) {
    columnParts.push("filterable: true");
  }
  if (field.order !== undefined) {
    columnParts.push(`order: ${field.order}`);
  }
  for (const [key, value] of Object.entries(field.columnExtras ?? {})) {
    columnParts.push(`${propertyKey(key)}: ${serializeValue(value, ctx)}`);
  }
  decorators.push(`@Column({ ${columnParts.join(", ")} })`);
  symbols.push("Column");
  if (field.sortable) {
    decorators.push("@Sortable()");
    symbols.push("Sortable");
  }
  if (field.archiveField) {
    decorators.push("@ArchiveField()");
    symbols.push("ArchiveField");
  }
  if (field.mandatory?.length) {
    const routes = field.mandatory.map((route) => JSON.stringify(route));
    decorators.push(`@Mandatory(${routes.join(", ")})`);
    symbols.push("Mandatory");
  }
  if (!field.required) {
    decorators.push("@Optional()");
    symbols.push("Optional");
  }
  const mode = field.access === "read" ? "ReadOnly" : "ReadWrite";
  decorators.push(`@Access(AccessMode.${mode})`);
  symbols.push("Access", "AccessMode");
  const ts = field.dbField?.ts ?? dbTypeFor(field.dataType).ts;
  return {
    text: fieldDeclaration(decorators, `${field.name}: ${ts}`),
    symbols,
  };
}

export interface DatabaseFileSpec {
  names: ResourceNames;
  filePath: string;
  schema?: string;
  fields: FieldSpec[];
  seeds?: Seeds;
  resolveRef?: EmitContext["resolveRef"];
  /** Whether the table declares `_id`; a relation without a key has none. Defaults to true. */
  idField?: boolean;
}

export interface DataApiFileSpec {
  names: ResourceNames;
  filePath: string;
  fields: FieldSpec[];
  routes?: ResourceRoute[];
  resolveRef?: EmitContext["resolveRef"];
}

export function buildDatabaseFile(spec: DatabaseFileSpec): EmittedFile {
  const { names, fields, seeds } = spec;
  const useCoreSchema = spec.schema === undefined;
  const schemaExpr = useCoreSchema
    ? CORE_SCHEMA_IDENTIFIER
    : JSON.stringify(spec.schema);
  const imports = new ImportSet();
  imports.addSymbol("BasicDataModel");
  imports.addSymbol("Field");
  imports.addSymbol("RegisterTable");
  imports.addSymbol("Table");
  if (useCoreSchema) {
    imports.addSymbol(CORE_SCHEMA_IDENTIFIER);
  }
  if (fields.some((field) => field.indexed)) {
    imports.addSymbol("Index");
  }

  const warnings: OpWarning[] = [];
  const indent = indentationText(resolveProjectRoot());
  const memberLines =
    spec.idField === false
      ? []
      : [indentDeclaration(idTableFieldText(), indent)];
  for (const field of fields) {
    const built = tableFieldText(field);
    memberLines.push(indentDeclaration(built.text, indent));
    warnings.push(...built.warnings);
  }

  const constLines = [`const tableName = ${JSON.stringify(names.tableName)};`];
  const decorators = [`@RegisterTable(tableName, ${schemaExpr})`];
  if (seeds && seeds.length > 0) {
    imports.addSymbol("Fixture");
    const { ctx, imports: seedImports } = createImportCollector({
      resolveRef: spec.resolveRef,
    });
    const seedsText = serializeValue(coerceSeeds(seeds, fields), ctx);
    for (const ref of seedImports) {
      imports.addRef(ref);
    }
    constLines.push(`const seeds = ${seedsText};`);
    decorators.push("@Fixture(() => seeds)");
  }

  const importBlock = imports.render(DATABASE_MODULE_ORDER, spec.filePath);
  const body = [
    importBlock,
    "",
    constLines.join("\n"),
    "",
    `${decorators.join("\n")}`,
    `export class ${names.className} extends Table {`,
    memberLines.join("\n"),
    "}",
    `export class ${names.modelName} extends BasicDataModel(${names.className}, tableName) {}`,
    "",
  ].join("\n");
  return { text: body, warnings };
}

export function buildDataApiFile(spec: DataApiFileSpec): EmittedFile {
  const { names, fields } = spec;
  const imports = new ImportSet();
  for (const name of [
    "Controller",
    "DataController",
    "RegisterDataController",
    "TableViewRoutes",
    "ModelReference",
    "Model",
    "Access",
    "AccessMode",
    "Select",
    "Listable",
  ] satisfies DecoratorSymbol[]) {
    imports.addSymbol(name);
  }
  imports.add(names.className, DATABASE_LOCAL);
  imports.add(names.modelName, DATABASE_LOCAL);

  const { ctx, imports: valueImports } = createImportCollector({
    resolveRef: spec.resolveRef,
  });
  const indent = indentationText(resolveProjectRoot());
  const memberLines = [
    indentDeclaration(
      fieldDeclaration(
        ["@ModelReference()", `@Model(${names.modelName})`],
        `model: ${names.modelName}`,
      ),
      indent,
    ),
    indentDeclaration(idDataApiFieldText(), indent),
  ];
  for (const field of fields) {
    const built = dataApiFieldText(field, ctx);
    for (const symbol of built.symbols) {
      imports.addSymbol(symbol);
    }
    memberLines.push(indentDeclaration(built.text, indent));
  }
  for (const ref of valueImports) {
    imports.addRef(ref);
  }

  const importBlock = imports.render(DATA_API_MODULE_ORDER, spec.filePath);
  const header = `export class ${names.apiName} extends DataController(${names.className}, ${routeMapExpr(spec.routes)}, Controller(${JSON.stringify(names.route)})) {`;
  const body = [
    importBlock,
    "",
    "@RegisterDataController()",
    header,
    memberLines.join("\n\n"),
    "}",
    "",
  ].join("\n");
  return { text: body, warnings: [] };
}

export function buildResourceIndex(): string {
  return `export * from "./database";\nexport * from "./data-api";\n`;
}
