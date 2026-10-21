/**
 * How wide a single-line input sits in its row: `"compact"` for a short
 * value, `"full"` (the default) to fill the row. Never inferred from the
 * input's bounds: a field is compact only when its data type asks for it.
 */
export type InputWidth = "compact" | "full";
