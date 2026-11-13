export type WiringReason =
  | "data"
  | "custom-component"
  | "table"
  | "held-block"
  | "move"
  | "locked"
  | "type";

/** What each wiring reason asks of whoever builds the rest, as the tool describes it. */
export const WIRING_REASONS: Readonly<Record<WiringReason, string>> = {
  data: "it reads data the live page does not serve: a fixture: reference standing for none of the page's liveRoutes, or a static* option its live block lacks. Wire it to a route or a query.",
  "custom-component":
    "a Custom sketch that is new, edited, or put in place of a block. Build it as a custom component, or with blocks.",
  table:
    "a table the mockup added, retyped, or whose columns, rows or source changed. Bind it to its resource with builder_configure_table_view.",
  "held-block":
    "a block held in an option of its parent, such as a ChartCard's chart, changed or was removed. The option keeps its live value.",
  move: "a live block the mockup moved to another parent, where the builder cannot rewrite it. It stays at kept: move it with builder_move_block.",
  locked:
    "a change the page's source locks: an option set in code, the type of such a block, or the order, slot or span of its children.",
  type: "a type the builder cannot write here: one no block registers, or a real block put in place of a live sketch.",
};

/** A node of the mockup the apply did not write, and why. */
export type WiringNote = {
  /** The node's JSON pointer into `spec.json`, `/pages/<i>/tree/...`. */
  pointer: string;
  id?: string;
  type?: string;
  reason: WiringReason;
  /** The builder path of the live block left as it was, when one was. */
  kept?: string;
};
