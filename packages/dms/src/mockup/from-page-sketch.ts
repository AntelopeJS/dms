import type { MockupNode } from "./model";
import {
  SKETCH_MAX_CAPTION,
  SKETCH_MAX_HEIGHT,
  SKETCH_MIN_HEIGHT,
  SKETCH_TYPE,
} from "./sketch";

export type SketchReason =
  | "custom-component"
  | "opaque"
  | "too-deep"
  | "controller"
  | "sentinel"
  | "templated-route"
  | "remote-route"
  | "unknown-type"
  | "invalid-options"
  | "children-not-allowed";

/** The only text a fallback sketch shows of why it is one, as its caption, per reason. */
const SKETCH_REASONS: Readonly<Record<SketchReason, string>> = {
  "custom-component": "A custom component: edit it in code.",
  opaque: "Written in a way the builder cannot edit: edit it in code.",
  "too-deep": "Nested deeper than a mockup draws.",
  controller: "Reads a resource a mockup cannot draw.",
  sentinel:
    "Holds a value set in code: a resource, a data type or an expression.",
  "templated-route": "Reads a route built from the page's parameters.",
  "remote-route": "Reads its data from outside this site.",
  "unknown-type": "Its block type is not one a mockup draws.",
  "invalid-options": "Its options do not fit its block type.",
  "children-not-allowed": "Holds blocks a mockup cannot draw inside it.",
};

export interface SketchSubject {
  name: string;
  /** The block's factory, or null for a custom component. */
  type: string | null;
  children: readonly string[];
}

/**
 * Text a sketch may show of a name: letters, digits, `_`, `$` and `-`, which
 * no rule of the sketch's forbidden markup can match. Anything else shows as
 * {@link UNNAMED}.
 */
const SHOWN_NAME = /^[\w$-]{1,64}$/;
const UNNAMED = "block";
const CUSTOM_COMPONENT = "CustomComponent";
const LISTED_CHILDREN = 8;
const BASE_HEIGHT = 72;
const LINE_HEIGHT = 22;
const MAX_FALLBACK_HEIGHT = 400;

const FALLBACK_CSS =
  ".lp-name{margin:0}.lp-kids{margin:8px 0 0;padding-left:18px;color:var(--sketch-text-muted)}";

function shown(name: string): string {
  return SHOWN_NAME.test(name) ? name : UNNAMED;
}

function childLines(children: readonly string[]): string[] {
  const listed = children.slice(0, LISTED_CHILDREN).map(shown);
  const rest = children.length - listed.length;
  return rest > 0 ? [...listed, `and ${rest} more`] : listed;
}

function heightFor(lines: number): number {
  return Math.min(
    MAX_FALLBACK_HEIGHT,
    SKETCH_MAX_HEIGHT,
    Math.max(SKETCH_MIN_HEIGHT, BASE_HEIGHT + lines * LINE_HEIGHT),
  );
}

/**
 * The Custom sketch standing for a block a mockup cannot draw; its caller
 * puts it where the block sat. Its caption is the reason's line. It shows
 * the block's name and type and the blocks under it, nothing else: every
 * name is checked against
 * {@link SHOWN_NAME} and every reason comes from {@link SKETCH_REASONS}, so
 * the compiler always admits it.
 */
export function sketchFor(
  subject: SketchSubject,
  reason: SketchReason,
): MockupNode {
  const why = SKETCH_REASONS[reason];
  const lines = childLines(subject.children);
  const list = lines.length
    ? `<ul class="lp-kids">${lines.map((line) => `<li>${line}</li>`).join("")}</ul>`
    : "";
  const html = `<p class="lp-name"><b>${shown(subject.name)}</b> · ${shown(subject.type ?? CUSTOM_COMPONENT)}</p>${list}`;
  return {
    type: SKETCH_TYPE,
    options: {
      html,
      css: FALLBACK_CSS,
      height: heightFor(lines.length),
      caption: why.slice(0, SKETCH_MAX_CAPTION),
    },
  };
}
