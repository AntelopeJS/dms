/** The `@ColumnGroup` decorators of a resource's DataAPI controller: how its form fields group. */

import type { ColumnGroupSpec } from "@antelopejs/interface-dms-builder";
import type { ClassDeclaration, Decorator, Node } from "ts-morph";
import { z } from "zod";
import type { LiteralValue } from "./guards";
import { stringLiteralValue } from "./literals";

/** The decorator a column group is declared with. */
export const COLUMN_GROUP = "ColumnGroup";

/** A column group's config, as `@ColumnGroup(id, config)` takes it. */
export const columnGroupSchema = z
  .object({
    label: z.string().min(1),
    description: z.string().optional(),
    orientation: z.enum(["horizontal", "vertical"]).optional(),
    order: z.number().optional(),
  })
  .strict() satisfies z.ZodType<ColumnGroupSpec>;

/** A `@ColumnGroup(id, config)` on a controller, read. */
export interface ColumnGroupRead {
  id: string;
  config: ColumnGroupSpec;
  decorator: Decorator;
}

/** The group a decorator declares, when it is a `@ColumnGroup` of a literal id and config. */
function groupOf(
  decorator: Decorator,
  read: (node: Node) => LiteralValue,
): ColumnGroupRead | undefined {
  const [idArg, configArg] = decorator.getArguments();
  const id = stringLiteralValue(idArg);
  if (decorator.getName() !== COLUMN_GROUP || id === undefined || !configArg) {
    return undefined;
  }
  try {
    const parsed = columnGroupSchema.safeParse(read(configArg));
    return parsed.success ? { id, config: parsed.data, decorator } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The column groups a controller declares, read by `read`, which throws on a
 * value that is not a literal. A group the builder cannot read is left out:
 * it stays in the code untouched.
 */
export function columnGroupsOf(
  apiClass: ClassDeclaration,
  read: (node: Node) => LiteralValue,
): ColumnGroupRead[] {
  return apiClass.getDecorators().flatMap((decorator) => {
    const group = groupOf(decorator, read);
    return group ? [group] : [];
  });
}
