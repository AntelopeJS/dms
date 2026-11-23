import type {
  CellDisplay,
  ColumnPresentation,
  FieldAspectsPatch,
} from "@antelopejs/interface-dms-builder";
import { Node } from "ts-morph";
import {
  cellDisplayIdOf,
  CELL_DISPLAYS,
  cellDisplayRefusal,
} from "./cell-displays";
import { isLiteralObject, type LiteralValue } from "./guards";
import { isBoolean, isNumber, isString } from "./scalar-guards";
import { type EmitContext, serializeValue } from "./value";

/** The `@Column` options a presentation holds, in the order they are written. */
export const PRESENTATION_KEYS = [
  "description",
  "group",
  "isVisible",
  "size",
  "cellWrap",
  "display",
] as const satisfies (keyof ColumnPresentation)[];

type PresentationKey = (typeof PRESENTATION_KEYS)[number];

const PRESENTATION_KEY_SET: ReadonlySet<string> = new Set(PRESENTATION_KEYS);

/** Whether `key` is an `@Column` option a presentation models. */
export function isPresentationKey(key: string): key is PresentationKey {
  return PRESENTATION_KEY_SET.has(key);
}

/** The `@Column` text of a cell display: `new DefaultDisplays.<Class>(options)`. */
function displayText(display: CellDisplay, ctx: EmitContext): string {
  const entry = CELL_DISPLAYS.get(display.type);
  if (!entry) {
    throw new Error(`no DefaultDisplays class draws "${display.type}"`);
  }
  const { options } = display;
  const argument =
    options && Object.keys(options).length > 0
      ? serializeValue(options, ctx)
      : "";
  return `new DefaultDisplays.${entry.className}(${argument})`;
}

/** The `@Column` options a field's presentation writes, each as `key: value`. */
export function presentationParts(
  field: ColumnPresentation,
  ctx: EmitContext,
): string[] {
  return PRESENTATION_KEYS.flatMap((key) => {
    if (key === "display") {
      return field.display
        ? [`display: ${displayText(field.display, ctx)}`]
        : [];
    }
    const value = field[key];
    return value === undefined ? [] : [`${key}: ${JSON.stringify(value)}`];
  });
}

/**
 * A display read off `new DefaultDisplays.<Class>(options)`, the options read
 * by `read`. None for another expression: it stays an option the builder does
 * not model, written back as it stands.
 */
function readDisplay(
  node: Node,
  read: (node: Node) => LiteralValue,
): CellDisplay | undefined {
  if (!Node.isNewExpression(node)) {
    return undefined;
  }
  const callee = node.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const type =
    callee.getExpression().getText() === "DefaultDisplays"
      ? cellDisplayIdOf(callee.getName())
      : undefined;
  const args = node.getArguments();
  if (type === undefined || args.length > 1) {
    return undefined;
  }
  const options = args[0] && read(args[0]);
  if (options === undefined) {
    return { type };
  }
  return isLiteralObject(options) ? { type, options } : undefined;
}

/**
 * The presentation option `key` read off its value in `@Column`, none when the
 * value is not one the builder writes: the caller keeps it among the options it
 * carries verbatim. `read` reads a literal, and throws on anything else.
 */
export function readPresentationOption(
  key: PresentationKey,
  node: Node,
  read: (node: Node) => LiteralValue,
): ColumnPresentation | undefined {
  if (key === "display") {
    try {
      const display = readDisplay(node, read);
      return display && { display };
    } catch {
      return undefined;
    }
  }
  let value: LiteralValue;
  try {
    value = read(node);
  } catch {
    return undefined;
  }
  switch (key) {
    case "description":
      return isString(value) ? { description: value } : undefined;
    case "group":
      return isString(value) ? { group: value } : undefined;
    case "isVisible":
      return isBoolean(value) ? { isVisible: value } : undefined;
    case "cellWrap":
      return isBoolean(value) ? { cellWrap: value } : undefined;
    case "size":
      return isNumber(value) ? { size: value } : undefined;
  }
}

/** Why a presentation cannot be written: a display or a width the TableView does not take. */
export function presentationRefusal(
  presentation: ColumnPresentation | FieldAspectsPatch,
): string | undefined {
  const { display, size } = presentation;
  if (isNumber(size) && !(size > 0)) {
    return `a column's size is a width in px above 0, not ${size}`;
  }
  return display ? cellDisplayRefusal(display) : undefined;
}

/**
 * The presentation a patch leaves a field with: each option sent replaces the
 * one written, `null` removes it, and an option left out stays.
 */
export function patchedPresentation(
  patch: FieldAspectsPatch,
  current: ColumnPresentation,
): ColumnPresentation {
  const merged: ColumnPresentation = {};
  for (const key of PRESENTATION_KEYS) {
    const sent = patch[key];
    const value = sent === undefined ? current[key] : (sent ?? undefined);
    if (value !== undefined) {
      Object.assign(merged, { [key]: value });
    }
  }
  return merged;
}

/** The presentation options a field's aspects hold, without the rest of them. */
export function presentationOf(field: ColumnPresentation): ColumnPresentation {
  return patchedPresentation({}, field);
}
