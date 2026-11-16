import type {
  BlockNode,
  PageStructure,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";

function blockAt(
  blocks: BlockNode[],
  [name, ...rest]: string[],
): BlockNode | undefined {
  const block = blocks.find((candidate) => candidate.name === name);
  return block && rest.length > 0 ? blockAt(block.children ?? [], rest) : block;
}

/**
 * The options of a block of a page as the AI reads it that hold a `{ $hidden: n }` value, the
 * block named by the segments of its path after the `#`.
 */
export function hiddenOptionsOf(
  shown: PageStructure,
  segments: string[],
): string[] {
  const config = blockAt(shown.blocks, segments)?.config;
  return Object.entries(config ?? {}).flatMap(([key, value]) =>
    containsHiddenValue.parse(value) ? [key] : [],
  );
}

const HIDDEN_VALUE = z
  .record(z.string(), z.unknown())
  .refine((object) => Object.hasOwn(object, "$hidden"));

/** Whether a tool's arguments send a `{ $hidden: n }` value back. */
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

/** Why a tool refuses arguments that send a `{ $hidden: n }` value back. */
export const HIDDEN_VALUE_REFUSAL =
  "Refused: a `{ $hidden: n }` value stands for n values that code over a mapped module holds and that may come from rows, which no tool shows. Leave its key out of the patch to keep what the code holds, or send a value of your own in its place.";
