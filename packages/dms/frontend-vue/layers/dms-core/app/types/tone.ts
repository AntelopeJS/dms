/**
 * The semantic tones a component shows a state in (a status pill, an icon
 * well, an empty state, a list value), the `Tone` of interface-dms. A
 * component that supports fewer narrows the union with `Extract<>`.
 */
export type Tone =
  | "neutral"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "info";
