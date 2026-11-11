import fs from "node:fs";
import path from "node:path";
import type {
  BlockTypeDescriptor,
  ConfigSchema,
  DataTypeDescriptor,
  OptionSchema,
} from "@antelopejs/interface-dms-builder";
import {
  type ClassDeclaration,
  type InterfaceDeclaration,
  Node,
  type ParameterDeclaration,
  Project,
  type SourceFile,
  type TypeAliasDeclaration,
  type TypeNode,
  type TypeParameterDeclaration,
} from "ts-morph";

const BASE_MODULE = "@antelopejs/interface-dms/base";
const DATATYPE_MODULE = `${BASE_MODULE}/data-types/default-types`;
const DATATYPE_ACCESSOR = "DefaultDataTypes";
/** Where the DataType classes are declared once `DefaultDataTypes` only re-exports them. */
const DATATYPE_FOLDER = "data-types/default";
const BUILDER_RETURN = /^(ComponentBuilder|FormBuilder)\b/;
const MAX_DEPTH = 4;

interface TypeIndex {
  interfaces: Map<string, InterfaceDeclaration>;
  aliases: Map<string, TypeAliasDeclaration>;
}

/** The declarations `loadBaseProject` will read, under `dir` at any depth. */
function hasDeclarations(dir: string): boolean {
  return fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .some((entry) => entry.endsWith(".d.ts"));
}

/**
 * Where the DMS base interface ships its declarations.
 *
 * Resolved through the interface package's own subpath rather than a path built
 * from the runtime package: the runtime blocks `./interfaces/*`, and the
 * interface package is free to move its build output as long as the subpath
 * keeps resolving.
 *
 * Checked rather than trusted. `require.resolve` answers with a file, and the
 * tree around it is the declaration tree only by convention: a package that
 * bundles `base` into one file, or ships none, leaves the glob below with
 * nothing to read. That failure is invisible -- an empty catalog looks exactly
 * like a DMS that declares no blocks -- so it is raised here instead, where the
 * reason is still known.
 */
function resolveDmsBaseDir(): string {
  let entry: string;
  try {
    entry = require.resolve(BASE_MODULE);
  } catch (error) {
    throw new Error(
      `Cannot resolve "${BASE_MODULE}". The builder reads the block factories and DataTypes off its declarations: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const baseDir = path.dirname(entry);
  if (!fs.statSync(baseDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(
      `"${BASE_MODULE}" resolved to ${entry}, which is not inside a directory the builder can read.`,
    );
  }
  if (!hasDeclarations(baseDir)) {
    throw new Error(
      `"${BASE_MODULE}" resolved to ${baseDir}, which ships no .d.ts declarations. The builder infers the block factories and DataTypes from them, so it cannot build a catalog from this package.`,
    );
  }
  return baseDir;
}

function loadBaseProject(baseDir: string): SourceFile[] {
  const project = new Project({
    useInMemoryFileSystem: false,
    compilerOptions: { allowJs: true, skipLibCheck: true },
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths(path.join(baseDir, "**/*.d.ts"));
  return project.getSourceFiles();
}

function collectTypes(sourceFiles: SourceFile[]): TypeIndex {
  const interfaces = new Map<string, InterfaceDeclaration>();
  const aliases = new Map<string, TypeAliasDeclaration>();
  for (const sourceFile of sourceFiles) {
    for (const declaration of sourceFile.getInterfaces()) {
      interfaces.set(declaration.getName(), declaration);
    }
    for (const declaration of sourceFile.getTypeAliases()) {
      aliases.set(declaration.getName(), declaration);
    }
  }
  return { interfaces, aliases };
}

function baseName(text: string): string {
  return text.replace(/<.*$/, "").trim();
}

function describeTypeText(text: string): OptionSchema {
  const trimmed = text.trim();
  if (trimmed === "string") return { type: "string" };
  if (trimmed === "number") return { type: "number" };
  if (trimmed === "boolean") return { type: "boolean" };
  if (trimmed.endsWith("[]") || trimmed.startsWith("Array<")) {
    return { type: "array" };
  }
  const literalUnion = /^(["'][^"']*["']\s*\|?\s*)+$/.test(trimmed);
  if (literalUnion) {
    return {
      type: "string",
      enum: trimmed
        .split("|")
        .map((part) => part.trim().replace(/^["']|["']$/g, "")),
    };
  }
  if (trimmed.includes("|")) return { type: "string" };
  if (/DataType\b/.test(trimmed)) return { type: "object", "x-dataType": true };
  if (/^Component(Builder)?\b/.test(trimmed)) {
    return { type: "object", "x-component": true };
  }
  return { type: "object" };
}

function schemaFromTypeNode(
  typeNode: TypeNode | undefined,
  index: TypeIndex,
  seen: Set<string>,
  depth = 0,
): ConfigSchema {
  if (!typeNode) return {};
  if (Node.isTypeLiteral(typeNode)) {
    return membersToSchema(typeNode.getProperties(), index, seen, depth);
  }
  const name = baseName(typeNode.getText());
  const declaration = index.interfaces.get(name);
  if (declaration) {
    if (seen.has(name)) return {};
    seen.add(name);
    const schema: ConfigSchema = {};
    for (const base of declaration.getExtends()) {
      Object.assign(schema, schemaFromTypeNode(base, index, seen, depth));
    }
    Object.assign(
      schema,
      membersToSchema(declaration.getProperties(), index, seen, depth),
    );
    return schema;
  }
  const alias = index.aliases.get(name);
  if (alias && !seen.has(name)) {
    seen.add(name);
    return schemaFromTypeNode(alias.getTypeNode(), index, seen, depth);
  }
  return {};
}

function arrayElementNode(typeNode: TypeNode): TypeNode | undefined {
  if (Node.isArrayTypeNode(typeNode)) return typeNode.getElementTypeNode();
  if (
    Node.isTypeReference(typeNode) &&
    typeNode.getTypeName().getText() === "Array"
  ) {
    return typeNode.getTypeArguments()[0];
  }
  return undefined;
}

function describeUnion(
  members: TypeNode[],
  index: TypeIndex,
  seen: Set<string>,
  depth: number,
): OptionSchema {
  const isStringLiteral = (node: TypeNode) =>
    Node.isLiteralTypeNode(node) && /^["']/.test(node.getText().trim());
  if (members.every(isStringLiteral)) {
    return {
      type: "string",
      enum: members.map((node) =>
        node
          .getText()
          .trim()
          .replace(/^["']|["']$/g, ""),
      ),
    };
  }
  const expandable = members.some(
    (node) =>
      Node.isTypeLiteral(node) ||
      index.interfaces.has(baseName(node.getText())),
  );
  if (expandable) {
    return {
      type: "object",
      oneOf: members.map((node) =>
        describeTypeNode(node, index, new Set(seen), depth + 1),
      ),
    };
  }
  return describeTypeText(members.map((node) => node.getText()).join(" | "));
}

function describeTypeNode(
  typeNode: TypeNode | undefined,
  index: TypeIndex,
  seen: Set<string>,
  depth: number,
): OptionSchema {
  if (!typeNode) return { type: "object" };
  if (depth >= MAX_DEPTH) return describeTypeText(typeNode.getText());
  if (Node.isTypeLiteral(typeNode)) {
    return {
      type: "object",
      properties: membersToSchema(
        typeNode.getProperties(),
        index,
        seen,
        depth + 1,
      ),
    };
  }
  const element = arrayElementNode(typeNode);
  if (element) {
    return {
      type: "array",
      items: describeTypeNode(element, index, seen, depth + 1),
    };
  }
  if (Node.isUnionTypeNode(typeNode)) {
    return describeUnion(typeNode.getTypeNodes(), index, seen, depth);
  }
  const name = baseName(typeNode.getText());
  if (/DataType\b/.test(name)) return { type: "object", "x-dataType": true };
  if (index.interfaces.has(name)) {
    if (seen.has(name)) return { type: "object" };
    return {
      type: "object",
      properties: schemaFromTypeNode(typeNode, index, new Set(seen), depth + 1),
    };
  }
  const alias = index.aliases.get(name);
  if (alias && !seen.has(name)) {
    const next = new Set(seen);
    next.add(name);
    return describeTypeNode(alias.getTypeNode(), index, next, depth);
  }
  return describeTypeText(typeNode.getText());
}

function membersToSchema(
  properties: Array<{
    getName(): string;
    hasQuestionToken(): boolean;
    getTypeNode(): TypeNode | undefined;
  }>,
  index: TypeIndex,
  seen: Set<string>,
  depth: number,
): ConfigSchema {
  const schema: ConfigSchema = {};
  for (const property of properties) {
    schema[property.getName()] = {
      ...describeTypeNode(property.getTypeNode(), index, seen, depth),
      optional: property.hasQuestionToken(),
    };
  }
  return schema;
}

interface FactorySignature {
  name: string;
  returnText: string;
  optionsType?: TypeNode;
  controllerArg: boolean;
  /** Whether the builder can write a call to it: see `writableParameters`. */
  writable: boolean;
}

/** The type parameters that stand for a table's DataAPI class. */
function controllerParams(
  typeParameters: TypeParameterDeclaration[],
): Set<string> {
  return new Set(
    typeParameters
      .filter((tp) =>
        /\bControllerClass\b/.test(tp.getConstraint()?.getText() ?? ""),
      )
      .map((tp) => tp.getName()),
  );
}

function controllerLeading(
  typeParameters: TypeParameterDeclaration[],
  firstParamType: TypeNode | undefined,
): boolean {
  if (!firstParamType) return false;
  return controllerParams(typeParameters).has(firstParamType.getText().trim());
}

/**
 * Whether a parameter takes an options object. Read off the type checker, not
 * the syntax: `(typeof MODES)[number]` is a string all the same. A type the
 * declarations cannot resolve reads as `any`, and is given the benefit of the
 * doubt.
 */
function takesOptions(parameter: ParameterDeclaration): boolean {
  const type = parameter.getType();
  const members = type.isUnion() ? type.getUnionTypes() : [type];
  return members
    .filter((member) => !member.isUndefined() && !member.isNull())
    .every(
      (member) =>
        member.isAny() ||
        member.isUnknown() ||
        (member.isObject() &&
          !member.isArray() &&
          member.getCallSignatures().length === 0),
    );
}

/**
 * Whether the builder can write a call to the factory: it writes the table
 * first when the factory reads one, then one options object, and nothing else.
 * A factory taking a name (`CustomComponent(componentName)`) or a mode before
 * its options (`resourceForm(controller, mode, options)`) is one no page can
 * be built with here, however it is offered.
 */
function writableParameters(
  parameters: ParameterDeclaration[],
  isControllerLeading: boolean,
): boolean {
  const [options, ...rest] = parameters.slice(isControllerLeading ? 1 : 0);
  return (
    (options === undefined || takesOptions(options)) &&
    rest.every((parameter) => parameter.isOptional())
  );
}

function readFactorySignature(
  name: string,
  returnText: string,
  typeParameters: TypeParameterDeclaration[],
  parameters: ParameterDeclaration[],
): FactorySignature {
  const isControllerLeading = controllerLeading(
    typeParameters,
    parameters[0]?.getTypeNode(),
  );
  return {
    name,
    returnText,
    optionsType: parameters[isControllerLeading ? 1 : 0]?.getTypeNode(),
    controllerArg: isControllerLeading,
    writable: writableParameters(parameters, isControllerLeading),
  };
}

function functionSignatures(sourceFile: SourceFile): FactorySignature[] {
  const signatures: FactorySignature[] = [];
  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name || !fn.isExported()) continue;
    signatures.push(
      readFactorySignature(
        name,
        fn.getReturnTypeNode()?.getText() ?? "",
        fn.getTypeParameters(),
        fn.getParameters(),
      ),
    );
  }
  for (const variable of sourceFile.getVariableDeclarations()) {
    if (!variable.getVariableStatement()?.isExported()) continue;
    const typeNode = variable.getTypeNode();
    if (!typeNode || !Node.isFunctionTypeNode(typeNode)) continue;
    signatures.push(
      readFactorySignature(
        variable.getName(),
        typeNode.getReturnTypeNode()?.getText() ?? "",
        typeNode.getTypeParameters(),
        typeNode.getParameters(),
      ),
    );
  }
  return signatures;
}

function discoverBlocks(
  sourceFiles: SourceFile[],
  index: TypeIndex,
): BlockTypeDescriptor[] {
  const blocks: BlockTypeDescriptor[] = [];
  for (const sourceFile of sourceFiles) {
    for (const signature of functionSignatures(sourceFile)) {
      if (!BUILDER_RETURN.test(signature.returnText.trim())) continue;
      if (!signature.writable) continue;
      blocks.push({
        type: signature.name,
        import: { name: signature.name, module: BASE_MODULE },
        container: true,
        config: schemaFromTypeNode(signature.optionsType, index, new Set()),
        configOrigin: "inferred",
        controllerArg: signature.controllerArg,
      });
    }
  }
  return blocks;
}

/**
 * The registered id of every DataType class, read off the emitted decorator
 * call: the id lives in a decorator argument, which the declarations do not
 * carry.
 *
 * The module holding `RegisterDataType` is matched by shape rather than by
 * name. TypeScript names the require binding after the specifier it came from,
 * so moving the decorator one file sideways renames it -- and a pattern pinned
 * to yesterday's name matches nothing, which reads as "this DMS registers no
 * DataTypes" rather than as a broken scrape.
 *
 * The classes are registered in `default-types.js`, or, where `DefaultDataTypes`
 * only re-exports them, in the files of `data-types/default/`.
 */
function readDataTypeIds(baseDir: string): Map<string, string> {
  const pattern =
    /(\w+) = __decorate\(\[\s*\(0, \w+\.RegisterDataType\)\("([^"]+)"\)/g;
  const ids = new Map<string, string>();
  for (const file of dataTypeSources(baseDir)) {
    const source = fs.readFileSync(file, "utf8");
    const before = ids.size;
    for (const match of source.matchAll(pattern)) {
      ids.set(match[1], match[2]);
    }
    if (ids.size === before && source.includes("RegisterDataType)(")) {
      throw new Error(
        `${file} registers DataTypes in a shape this build does not recognise, so none could be read. The emitted decorator call has changed.`,
      );
    }
  }
  return ids;
}

/** The emitted files that register DataTypes: `default-types.js`, then those of `data-types/default/`. */
function dataTypeSources(baseDir: string): string[] {
  const folder = path.join(baseDir, DATATYPE_FOLDER);
  const split = fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()
    ? fs
        .readdirSync(folder)
        .filter((name) => name.endsWith(".js"))
        .sort()
        .map((name) => path.join(folder, name))
    : [];
  return [path.join(baseDir, "data-types/default-types.js"), ...split];
}

/**
 * The DataType classes `DefaultDataTypes` offers, by name: declared in the namespace, or
 * re-exported there with `export import` from the files of `data-types/default/`.
 */
function offeredDataTypeClasses(
  sourceFiles: SourceFile[],
): Map<string, ClassDeclaration> {
  const offered = new Set<string>();
  const declared = new Map<string, ClassDeclaration>();
  const folder = `/${DATATYPE_FOLDER}/`;
  for (const sourceFile of sourceFiles) {
    const namespace = sourceFile.getModule(DATATYPE_ACCESSOR);
    if (namespace) {
      for (const cls of namespace.getClasses()) {
        offered.add(cls.getName() ?? "");
        declared.set(cls.getName() ?? "", cls);
      }
      for (const statement of namespace.getStatements()) {
        if (Node.isImportEqualsDeclaration(statement)) {
          offered.add(statement.getName());
        }
      }
    }
    if (sourceFile.getFilePath().replaceAll("\\", "/").includes(folder)) {
      for (const cls of sourceFile.getClasses()) {
        if (!declared.has(cls.getName() ?? "")) {
          declared.set(cls.getName() ?? "", cls);
        }
      }
    }
  }
  return new Map([...declared].filter(([name]) => offered.has(name)));
}

/**
 * Marks the options a DataType is handed a table's DataAPI class in — a
 * relation's `dataApiController`.
 *
 * Their type is the class's own parameter, `T`, and the text alone does not
 * say what `T` is: read as an object, the option was offered as JSON to type
 * in, for a value no one can write as JSON. The constraint on the parameter is
 * what says it is a table.
 */
function markControllerOptions(
  config: ConfigSchema,
  optionsType: TypeNode | undefined,
  controllers: Set<string>,
): ConfigSchema {
  if (!optionsType || !Node.isTypeLiteral(optionsType) || !controllers.size) {
    return config;
  }
  const marked: ConfigSchema = { ...config };
  for (const property of optionsType.getProperties()) {
    const text = property.getTypeNode()?.getText().trim() ?? "";
    if (controllers.has(text)) {
      marked[property.getName()] = {
        type: "unknown",
        optional: property.hasQuestionToken(),
        "x-controller": true,
      };
    }
  }
  return marked;
}

function discoverDataTypes(
  sourceFiles: SourceFile[],
  index: TypeIndex,
  baseDir: string,
): DataTypeDescriptor[] {
  const ids = readDataTypeIds(baseDir);
  const descriptors: DataTypeDescriptor[] = [];
  for (const cls of offeredDataTypeClasses(sourceFiles).values()) {
    const id = ids.get(cls.getName() ?? "");
    if (!id) continue;
    const optionsProp = cls.getProperty("options");
    const optionsType =
      optionsProp && Node.isPropertyDeclaration(optionsProp)
        ? optionsProp.getTypeNode()
        : undefined;
    descriptors.push({
      id,
      import: {
        name: `${DATATYPE_ACCESSOR}.${cls.getName()}`,
        module: DATATYPE_MODULE,
      },
      config: markControllerOptions(
        schemaFromTypeNode(optionsType, index, new Set()),
        optionsType,
        controllerParams(cls.getTypeParameters()),
      ),
    });
  }
  return descriptors;
}

interface BaseSources {
  sourceFiles: SourceFile[];
  index: TypeIndex;
  baseDir: string;
}

let sources: BaseSources | undefined;

function loadSources(): BaseSources {
  if (!sources) {
    const baseDir = resolveDmsBaseDir();
    const sourceFiles = loadBaseProject(baseDir);
    sources = { sourceFiles, index: collectTypes(sourceFiles), baseDir };
  }
  return sources;
}

/** Block factories read off the `dms-base` type declarations. */
export function inferBlocks(): BlockTypeDescriptor[] {
  const loaded = loadSources();
  return discoverBlocks(loaded.sourceFiles, loaded.index);
}

/** DataTypes read off the `dms-base` type declarations and registrations. */
export function inferDataTypes(): DataTypeDescriptor[] {
  const loaded = loadSources();
  return discoverDataTypes(loaded.sourceFiles, loaded.index, loaded.baseDir);
}

export function invalidateInference(): void {
  sources = undefined;
}
