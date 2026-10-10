import type { Tag } from "@lezer/highlight";
import { tags } from "@lezer/highlight";

/**
 * How one kind of token is drawn: its colour, and italic for comments. A type
 * rather than an interface, so it binds to a `style` attribute as it is.
 */
export type CodeTokenStyle = {
  color: string;
  fontStyle?: string;
};

/** The tokens one entry of the palette colours. */
export interface CodePaletteEntry extends CodeTokenStyle {
  tag: Tag | Tag[];
}

/**
 * The query console's palette, read from the theme's variables so light and
 * dark follow the app: the editor and the read-only snippets draw code alike.
 */
export const CODE_PALETTE: CodePaletteEntry[] = [
  { tag: [tags.keyword, tags.operatorKeyword], color: "var(--ui-primary)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--ui-success)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--ui-warning)" },
  { tag: [tags.comment], color: "var(--ui-text-dimmed)", fontStyle: "italic" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--ui-info)" },
  { tag: [tags.function(tags.variableName)], color: "var(--ui-primary)" },
  { tag: [tags.tagName], color: "var(--ui-primary)" },
  { tag: [tags.invalid], color: "var(--ui-error)" },
  { tag: [tags.special(tags.variableName)], color: "var(--ui-warning)" },
];
