import { createHash } from "node:crypto";
import type {
  BlockNode,
  ConfigObject,
  ConfigValue,
  DataTypeValue,
  PageStructure,
  ResourceStructure,
} from "@antelopejs/interface-dms-builder";
import { isString } from "./scalar-guards";

/**
 * What becomes of a row literal: a literal of code that a mapping fills from rows, a select's
 * `items`, a price's `currency` or a TableView's `tabs`.
 */
export type RowLiteralMap = (value: ConfigValue) => ConfigValue;

/** The option of each DataType that a mapping fills from rows. */
const DATA_TYPE_ROW_OPTIONS: ReadonlyMap<string, string> = new Map([
  ["select", "items"],
  ["price", "currency"],
]);

/** The option of each block type that a mapping fills from rows. */
const BLOCK_ROW_OPTIONS: ReadonlyMap<string, string> = new Map([
  ["TableView", "tabs"],
]);

function withOption<T extends ConfigObject>(
  object: T,
  option: string | undefined,
  map: RowLiteralMap,
): T {
  return option !== undefined && Object.hasOwn(object, option)
    ? { ...object, [option]: map(object[option]) }
    : object;
}

function mapDataType(
  dataType: DataTypeValue,
  map: RowLiteralMap,
): DataTypeValue {
  const { config } = dataType;
  if (config === undefined) return dataType;
  const option = DATA_TYPE_ROW_OPTIONS.get(dataType.$dataType);
  return { ...dataType, config: withOption(config, option, map) };
}

function isConfigObject(value: ConfigValue): value is ConfigObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDataType(object: ConfigObject): object is DataTypeValue {
  return (
    typeof object.$dataType === "string" &&
    (object.config === undefined || isConfigObject(object.config))
  );
}

function mapConfigValue(value: ConfigValue, map: RowLiteralMap): ConfigValue {
  if (Array.isArray(value))
    return value.map((item) => mapConfigValue(item, map));
  return isConfigObject(value) ? mapConfigObject(value, map) : value;
}

function mapConfigObject(
  object: ConfigObject,
  map: RowLiteralMap,
): ConfigObject {
  const walked: ConfigObject = Object.fromEntries(
    Object.entries(object).map(([key, value]) => [
      key,
      mapConfigValue(value, map),
    ]),
  );
  return isDataType(walked) ? mapDataType(walked, map) : walked;
}

function mapBlock(block: BlockNode, map: RowLiteralMap): BlockNode {
  const mapped: BlockNode = { ...block };
  if (block.config) {
    const option =
      block.type === null ? undefined : BLOCK_ROW_OPTIONS.get(block.type);
    mapped.config = withOption(mapConfigObject(block.config, map), option, map);
  }
  if (block.children) {
    mapped.children = block.children.map((child) => mapBlock(child, map));
  }
  return mapped;
}

/** A resource with `map` applied to each row literal of its fields' DataTypes. */
export function mapResourceRowLiterals(
  structure: ResourceStructure,
  map: RowLiteralMap,
): ResourceStructure {
  return {
    ...structure,
    fields: structure.fields.map((field) =>
      field.dataType
        ? { ...field, dataType: mapDataType(field.dataType, map) }
        : field,
    ),
  };
}

/** A page with `map` applied to each row literal of its blocks: tabs, select items, currencies. */
export function mapPageRowLiterals(
  structure: PageStructure,
  map: RowLiteralMap,
): PageStructure {
  return {
    ...structure,
    blocks: structure.blocks.map((block) => mapBlock(block, map)),
  };
}

/** The row literals a walk over a structure meets, in its order. */
export function rowLiteralsOf(
  walk: (map: RowLiteralMap) => PageStructure | ResourceStructure,
): ConfigValue[] {
  const values: ConfigValue[] = [];
  walk((value) => {
    values.push(value);
    return value;
  });
  return values;
}

function elementValue(element: ConfigValue): ConfigValue {
  if (!isConfigObject(element)) return element;
  const { filter } = element;
  return isConfigObject(filter) ? filter.value : element.value;
}

/**
 * The values from rows a row literal holds: each select item's `value`, each tab's filter
 * `value`, or the currency itself. A tab with no filter, such as "All", holds none.
 */
export function rowValuesOf(literal: ConfigValue): string[] {
  const elements = Array.isArray(literal)
    ? literal.map(elementValue)
    : [literal];
  return elements.filter(isString);
}

/** The digest a module's record keeps for a value from rows its mapping wrote, holding none of it. */
export function rowValueDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
