import type {
  BlockNode,
  ConfigObject,
  ConfigValue,
  DataTypeValue,
  PageStructure,
  ResourceStructure,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";

/**
 * A literal of a mapped module's code that its mapping read from rows, as the AI reads it: how
 * many values it stands for. A badge's items, a price's currency and a TableView's tabs are such
 * literals.
 */
export interface HiddenValue {
  $hidden: number;
}

/** The option of each DataType that a mapping fills from rows. */
const DATA_TYPE_ROW_OPTIONS: ReadonlyMap<string, string> = new Map([
  ["select", "items"],
  ["price", "currency"],
]);

/** The option of each block type that a mapping fills from rows. */
const BLOCK_ROW_OPTIONS: ReadonlyMap<string, string> = new Map([
  ["TableView", "tabs"],
]);

function hiddenValue(value: ConfigValue): HiddenValue {
  return { $hidden: Array.isArray(value) ? value.length : 1 };
}

function withOptionHidden<T extends ConfigObject>(
  object: T,
  option: string | undefined,
): T {
  return option !== undefined && Object.hasOwn(object, option)
    ? { ...object, [option]: hiddenValue(object[option]) }
    : object;
}

function hideDataType(dataType: DataTypeValue): DataTypeValue {
  const { config } = dataType;
  if (config === undefined) return dataType;
  const option = DATA_TYPE_ROW_OPTIONS.get(dataType.$dataType);
  return { ...dataType, config: withOptionHidden(config, option) };
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

function hideConfigValue(value: ConfigValue): ConfigValue {
  if (Array.isArray(value)) return value.map(hideConfigValue);
  return isConfigObject(value) ? hideConfigObject(value) : value;
}

function hideConfigObject(object: ConfigObject): ConfigObject {
  const walked: ConfigObject = Object.fromEntries(
    Object.entries(object).map(([key, value]) => [key, hideConfigValue(value)]),
  );
  return isDataType(walked) ? hideDataType(walked) : walked;
}

function hideBlock(block: BlockNode): BlockNode {
  const hidden: BlockNode = { ...block };
  if (block.config) {
    const option =
      block.type === null ? undefined : BLOCK_ROW_OPTIONS.get(block.type);
    hidden.config = withOptionHidden(hideConfigObject(block.config), option);
  }
  if (block.children) hidden.children = block.children.map(hideBlock);
  return hidden;
}

/** A mapped module's resource with each badge's items and each price's currency hidden. */
export function hideResourceValues(
  structure: ResourceStructure,
): ResourceStructure {
  return {
    ...structure,
    fields: structure.fields.map((field) =>
      field.dataType
        ? { ...field, dataType: hideDataType(field.dataType) }
        : field,
    ),
  };
}

/** A mapped module's page with each TableView's tabs, badge items and currency hidden. */
export function hidePageValues(structure: PageStructure): PageStructure {
  return { ...structure, blocks: structure.blocks.map(hideBlock) };
}

function blockAt(
  blocks: BlockNode[],
  [name, ...rest]: string[],
): BlockNode | undefined {
  const block = blocks.find((candidate) => candidate.name === name);
  return block && rest.length > 0 ? blockAt(block.children ?? [], rest) : block;
}

/**
 * The options of a mapped page's block that hold a {@link HiddenValue}, the block named by the
 * segments of its path after the `#`.
 */
export function hiddenOptionsOf(
  structure: PageStructure,
  segments: string[],
): string[] {
  const config = blockAt(hidePageValues(structure).blocks, segments)?.config;
  return Object.entries(config ?? {}).flatMap(([key, value]) =>
    containsHiddenValue.parse(value) ? [key] : [],
  );
}

const HIDDEN_VALUE = z
  .record(z.string(), z.unknown())
  .refine((object) => Object.hasOwn(object, "$hidden"));

/** Whether a tool's arguments send a {@link HiddenValue} back. */
export const containsHiddenValue: z.ZodType<boolean, z.ZodTypeDef, unknown> =
  z.lazy(() =>
    z.union([
      HIDDEN_VALUE.transform(() => true),
      z.array(containsHiddenValue).transform((items) => items.some(Boolean)),
      z
        .record(z.string(), containsHiddenValue)
        .transform((members) => Object.values(members).some(Boolean)),
      z.unknown().transform(() => false),
    ]),
  );

/** Why a tool refuses arguments that send a {@link HiddenValue} back. */
export const HIDDEN_VALUE_REFUSAL =
  "Refused: a `{ $hidden: n }` value stands for n values that code over a mapped module holds and that may come from rows, which no tool shows. Leave its key out of the patch to keep what the code holds, or send a value of your own in its place.";
