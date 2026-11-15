import type {
  BlockNode,
  ConfigValue,
  PageStructure,
  ResourceStructure,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import {
  mapPageRowLiterals,
  mapResourceRowLiterals,
  type RowLiteralMap,
} from "../implementations/dms-builder/engine/row-literals";

/**
 * A row literal a mapping wrote, as the AI reads it: how many values it stands for. A badge's
 * items, a price's currency and a TableView's tabs are such literals.
 */
export type HiddenValue = { $hidden: number };

function hiddenValue(value: ConfigValue): HiddenValue {
  return { $hidden: Array.isArray(value) ? value.length : 1 };
}

/** Which row literals a mapping wrote, so the AI reads them hidden. */
export type MappedLiteralTest = (value: ConfigValue) => boolean;

function hideMapped(isMapped: MappedLiteralTest): RowLiteralMap {
  return (value) => (isMapped(value) ? hiddenValue(value) : value);
}

/** A resource with each badge's items and each price's currency a mapping wrote hidden. */
export function hideResourceValues(
  structure: ResourceStructure,
  isMapped: MappedLiteralTest,
): ResourceStructure {
  return mapResourceRowLiterals(structure, hideMapped(isMapped));
}

/** A page with each TableView's tabs, badge items and currency a mapping wrote hidden. */
export function hidePageValues(
  structure: PageStructure,
  isMapped: MappedLiteralTest,
): PageStructure {
  return mapPageRowLiterals(structure, hideMapped(isMapped));
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
  isMapped: MappedLiteralTest,
): string[] {
  const config = blockAt(
    hidePageValues(structure, isMapped).blocks,
    segments,
  )?.config;
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
