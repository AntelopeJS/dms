import { z } from "zod";
import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view";

const SerializedColumnSchema = z.object({
  id: z.string(),
  size: z.number().optional(),
  display: z.unknown(),
  isVisible: z.boolean().optional(),
  listable: z.boolean().optional(),
  enableColumnFilter: z.boolean().optional(),
  enableSorting: z.boolean().optional(),
});

const SerializedColumnsSchema = z.object({
  columns: z.array(SerializedColumnSchema),
});

/** A column as a table view serializes it, read at the fields the tests use. */
export type SerializedColumn = z.infer<typeof SerializedColumnSchema>;

/**
 * The columns of a served table view's options. The options type omits them,
 * as the table view writes them from its metadata at serialization time;
 * throws when they are absent or malformed.
 */
export function serializedColumnsOf(
  options: TableViewOptionsSerialized | undefined,
): SerializedColumn[] {
  return SerializedColumnsSchema.parse(options).columns;
}
