import type {
  LogoPathsByMode,
  LogoSlot,
  ThemeColorRole,
  ThemeColors,
  ThemeLogos,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import {
  type ArrayLiteralExpression,
  type BinaryExpression,
  Node,
  type ObjectLiteralExpression,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import { isString } from "./scalar-guards";
import {
  canWriteString,
  defaultExportObject,
  findProperty,
  objectLiteralValue,
  objectToEdit,
  removeIfEmpty,
  setStringProperty,
  stringLiteralValue,
} from "./theme-literals";
import { THEME_MODES } from "./theme-stylesheet";

/** The app config, relative to the theme's root in the layer. */
export const APP_CONFIG_FILE = "app/app.config.ts";

export const LOGO_SLOTS: LogoSlot[] = [
  "default",
  "collapsed",
  "email",
  "favicon",
];

/**
 * Extensions allowed in restricted slots. The email logo must be a PNG or a
 * JPEG, as the DMS documents for `branding.logo.email`: Gmail and Outlook show
 * no SVG, WebP or ICO.
 */
const SLOT_EXTENSIONS: Partial<Record<LogoSlot, string[]>> = {
  email: ["png", "jpg", "jpeg"],
};

export const COLOR_ROLES: ThemeColorRole[] = [
  "primary",
  "success",
  "warning",
  "error",
  "info",
];

/**
 * The app config a layer starts from when it has none yet, in the form the
 * DMS frontend loader documents: `defineDmsAppConfig` is a global of every
 * layer it compiles, and returns its argument as it is.
 */
export const EMPTY_APP_CONFIG = "export default defineDmsAppConfig({});\n";

const UI_KEY = "ui";
const COLORS_KEY = "colors";
const BRANDING_KEY = "branding";
const LOGO_KEY = "logo";

/**
 * A path the frontend serves from `public/`: rooted, never climbing out, and
 * never `//host/…`, which a browser reads as a URL on another host.
 */
const PUBLIC_PATH = /^\/(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]+$/;

/**
 * A palette name as Nuxt UI resolves it to `--color-<name>-50…950`: a
 * Tailwind palette, or one a stylesheet of the project declares.
 */
const PALETTE_NAME = /^[a-z][a-z0-9-]*$/;

export function slotAccepts(slot: LogoSlot, extension: string): boolean {
  return SLOT_EXTENSIONS[slot]?.includes(extension.toLowerCase()) ?? true;
}

function nestedObject(
  config: ObjectLiteralExpression,
  outer: string,
  inner: string,
): ObjectLiteralExpression | undefined {
  const parent = objectLiteralValue(config, outer);
  return parent ? objectLiteralValue(parent, inner) : undefined;
}

function readLogoPaths(slotLiteral: ObjectLiteralExpression): LogoPathsByMode {
  const pathsByMode: LogoPathsByMode = {};
  for (const mode of THEME_MODES) {
    const value = stringLiteralValue(slotLiteral, mode);
    if (value !== undefined) {
      pathsByMode[mode] = value;
    }
  }
  return pathsByMode;
}

/**
 * Logo paths under `branding.logo`. Only string literals are read: a computed
 * path reads as unset.
 */
export function readLogos(sourceFile: SourceFile): ThemeLogos {
  const config = defaultExportObject(sourceFile);
  const brandingLogo = config
    ? nestedObject(config, BRANDING_KEY, LOGO_KEY)
    : undefined;
  const logos: ThemeLogos = {};
  for (const slot of LOGO_SLOTS) {
    const slotLiteral = brandingLogo
      ? objectLiteralValue(brandingLogo, slot)
      : undefined;
    const pathsByMode = slotLiteral ? readLogoPaths(slotLiteral) : {};
    if (Object.keys(pathsByMode).length > 0) {
      logos[slot] = pathsByMode;
    }
  }
  return logos;
}

/**
 * Every string a file spells as a literal, wherever it sits, and the text
 * between the substitutions of each template literal.
 */
export function stringLiterals(sourceFile: SourceFile): Set<string> {
  return new Set(
    sourceFile.getDescendants().flatMap((node) => {
      if (
        Node.isStringLiteral(node) ||
        Node.isNoSubstitutionTemplateLiteral(node)
      ) {
        return [node.getLiteralValue()];
      }
      return Node.isTemplateHead(node) ||
        Node.isTemplateMiddle(node) ||
        Node.isTemplateTail(node)
        ? [node.getLiteralText()]
        : [];
    }),
  );
}

/**
 * The static text of a file name a string expression may build, split where a
 * runtime value goes: `/branding/${slot}-light-${hash}.png?v=${v}` builds
 * `["", "-light-", ".png"]`, and `"/branding/" + "default-light-ab12cd34.png"`
 * builds `["default-light-ab12cd34.png"]`.
 */
export type BuiltFileName = readonly [string, ...string[]];

/** A character no builder-named file holds, such as `/`, `?`, `#` or `&`. */
const NOT_IN_FILE_NAME = /[^\w.-]/;

/** A percent-encoded byte, as in `%2F`. */
const PERCENT_ESCAPE = /%([0-9A-Fa-f]{2})/g;

/**
 * The text with each percent-encoded byte decoded, so `%2Fbranding%2Flogo.png`
 * reads as `/branding/logo.png`. A byte above 0x7F decodes to a character no
 * file name holds, as its UTF-8 sequence would.
 */
function decodePercentEscapes(text: string): string {
  return text.replace(PERCENT_ESCAPE, (_escape, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/**
 * Each stretch of the text between characters no file name holds, so a file
 * named in a path, a query or a fragment, percent-encoded or not, is one of
 * them, when it spells some text: a name of runtime values alone could be any
 * file.
 */
function builtSegments(parts: string[]): BuiltFileName[] {
  const segments: string[][] = [];
  let current: string[] = [];
  for (const part of parts) {
    const [head = "", ...later] =
      decodePercentEscapes(part).split(NOT_IN_FILE_NAME);
    current.push(head);
    for (const text of later) {
      segments.push(current);
      current = [text];
    }
  }
  segments.push(current);
  return segments.flatMap(([first = "", ...rest]) => {
    const segment: BuiltFileName = [first, ...rest];
    return segment.join("") === "" ? [] : [segment];
  });
}

/** Text an expression spells, or `undefined` where a runtime value goes. */
type Piece = string | undefined;

function isConcatenation(node: Node | undefined): node is BinaryExpression {
  return (
    Node.isBinaryExpression(node) &&
    node.getOperatorToken().getKind() === SyntaxKind.PlusToken
  );
}

function methodCall(
  node: Node,
  name: string,
): { receiver: Node; args: Node[] } | undefined {
  if (!Node.isCallExpression(node)) {
    return undefined;
  }
  const callee = node.getExpression();
  return Node.isPropertyAccessExpression(callee) && callee.getName() === name
    ? { receiver: callee.getExpression(), args: node.getArguments() }
    : undefined;
}

function joinedPieces(
  array: ArrayLiteralExpression,
  separator: Node | undefined,
): Piece[] {
  const between = separator ? pieces(separator) : [","];
  return array
    .getElements()
    .flatMap((element, index) => [
      ...(index === 0 ? [] : between),
      ...pieces(element),
    ]);
}

/**
 * The text and runtime values an expression joins into a string, in order,
 * through template literals, `+`, `.concat()` and `[…].join()`.
 */
function pieces(node: Node): Piece[] {
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return [node.getLiteralValue()];
  }
  if (Node.isTemplateExpression(node)) {
    return [
      node.getHead().getLiteralText(),
      ...node
        .getTemplateSpans()
        .flatMap((span) => [undefined, span.getLiteral().getLiteralText()]),
    ];
  }
  if (Node.isParenthesizedExpression(node)) {
    return pieces(node.getExpression());
  }
  if (isConcatenation(node)) {
    return [...pieces(node.getLeft()), ...pieces(node.getRight())];
  }
  const concat = methodCall(node, "concat");
  if (concat) {
    return [concat.receiver, ...concat.args].flatMap(pieces);
  }
  const join = methodCall(node, "join");
  return join && Node.isArrayLiteralExpression(join.receiver)
    ? joinedPieces(join.receiver, join.args[0])
    : [undefined];
}

function textBetweenRuntimeValues(joined: Piece[]): string[] {
  const parts = [""];
  for (const piece of joined) {
    parts.push(piece === undefined ? "" : `${parts.pop() ?? ""}${piece}`);
  }
  return parts;
}

function enclosingExpression(node: Node): Node | undefined {
  const parent = node.getParent();
  return Node.isParenthesizedExpression(parent)
    ? enclosingExpression(parent)
    : parent;
}

/**
 * A template literal, or a `+` chain, `.concat()` or `[…].join()` that is not
 * an operand of a larger `+` chain, whose file name would then match too much.
 */
function buildsAString(node: Node): boolean {
  return (
    Node.isTemplateExpression(node) ||
    ((isConcatenation(node) ||
      methodCall(node, "concat") !== undefined ||
      methodCall(node, "join") !== undefined) &&
      !isConcatenation(enclosingExpression(node)))
  );
}

/**
 * The file names each template literal, `+` chain, `.concat()` or `[…].join()`
 * of a file may build.
 */
export function builtFileNames(sourceFile: SourceFile): BuiltFileName[] {
  return sourceFile
    .getDescendants()
    .filter(buildsAString)
    .flatMap((node) => builtSegments(textBetweenRuntimeValues(pieces(node))));
}

/** Whether some value of the substitutions makes the template build this name. */
export function buildsFileName(
  [first, ...later]: BuiltFileName,
  fileName: string,
): boolean {
  const last = later.pop();
  if (last === undefined) {
    return fileName === first;
  }
  if (
    !fileName.startsWith(first) ||
    !fileName.endsWith(last) ||
    fileName.length < first.length + last.length
  ) {
    return false;
  }
  let position = first.length;
  for (const part of later) {
    const found = fileName.indexOf(part, position);
    if (found < 0) {
      return false;
    }
    position = found + part.length;
  }
  return position <= fileName.length - last.length;
}

/** The palettes an app config picks under `ui.colors`, string literals only. */
export function readColors(sourceFile: SourceFile): ThemeColors {
  const config = defaultExportObject(sourceFile);
  const colorsLiteral = config
    ? nestedObject(config, UI_KEY, COLORS_KEY)
    : undefined;
  const palettes: ThemeColors = {};
  for (const role of COLOR_ROLES) {
    const value = colorsLiteral
      ? stringLiteralValue(colorsLiteral, role)
      : undefined;
    if (value !== undefined) {
      palettes[role] = value;
    }
  }
  return palettes;
}

/**
 * A key is unwritable when it is not a string literal or its object has a
 * spread. A draft value equal to what was read (the literal, or nothing for
 * any other value) is no change.
 */
function ownValue(
  values: Partial<Record<string, string>>,
  key: string,
): string | undefined {
  return Object.hasOwn(values, key) ? values[key] : undefined;
}

function unwritableChangedKeys(
  target: ObjectLiteralExpression,
  values: Partial<Record<string, string>>,
  keys: readonly string[],
): string[] {
  return keys.filter(
    (key) =>
      !canWriteString(target, key) &&
      ownValue(values, key) !== stringLiteralValue(target, key),
  );
}

/**
 * Sets each of `keys` in the object at `keyPath` under `config` to its string
 * in `values`, and removes those `values` omits. Objects on the path are
 * created when something is written, and removed once emptied. Returns the
 * key paths held in code the builder cannot rewrite that the draft would
 * change; then nothing is edited.
 */
function writeStrings(
  config: ObjectLiteralExpression,
  keyPath: string[],
  values: Partial<Record<string, string>>,
  keys: readonly string[],
): string[] {
  const hasValuesToWrite = keys.some(
    (key) => ownValue(values, key) !== undefined,
  );
  const chain: ObjectLiteralExpression[] = [config];
  let target = config;
  for (const key of keyPath) {
    const next = objectToEdit(target, key, hasValuesToWrite);
    if (next === null) {
      return hasValuesToWrite ? [keyPath.slice(0, chain.length).join(".")] : [];
    }
    if (next === undefined) {
      return [];
    }
    chain.push(next);
    target = next;
  }
  const unwritableKeys = unwritableChangedKeys(target, values, keys);
  if (unwritableKeys.length > 0) {
    return unwritableKeys.map((key) => [...keyPath, key].join("."));
  }
  let hasRemovedKey = false;
  for (const key of keys.filter((name) => canWriteString(target, name))) {
    const value = ownValue(values, key);
    const property = findProperty(target, key);
    if (value !== undefined) {
      setStringProperty(target, key, value);
    } else if (property) {
      property.remove();
      hasRemovedKey = true;
    }
  }
  const parents = hasRemovedKey ? chain.slice(0, keyPath.length) : [];
  for (const [depth, parent] of [...parents.entries()].reverse()) {
    removeIfEmpty(parent, keyPath[depth] ?? "");
  }
  return [];
}

/**
 * Writes the draft's palettes and logo paths into the app config and leaves
 * the rest of the file as written. Returns why it cannot: the file does not
 * default-export an object literal, or the draft changes a key held in
 * non-literal code.
 */
export function writeAppConfig(
  sourceFile: SourceFile,
  colors: ThemeColors,
  logos: ThemeLogos,
): string | undefined {
  const config = defaultExportObject(sourceFile);
  if (!config) {
    return "it does not default-export an object literal";
  }
  const refusals = [
    ...writeStrings(config, [UI_KEY, COLORS_KEY], colors, COLOR_ROLES),
    ...LOGO_SLOTS.flatMap((slot) =>
      writeStrings(
        config,
        [BRANDING_KEY, LOGO_KEY, slot],
        logos[slot] ?? {},
        THEME_MODES,
      ),
    ),
  ];
  return refusals.length > 0
    ? `it sets ${refusals.join(", ")} with code the builder does not rewrite (an expression, a shorthand, a method or a spread): change it in the file itself`
    : undefined;
}

export function logoPaths(logos: ThemeLogos): string[] {
  return LOGO_SLOTS.flatMap((slot) =>
    THEME_MODES.flatMap((mode) => logos[slot]?.[mode] ?? []),
  );
}

function logoPathProblem(
  slot: LogoSlot,
  mode: string,
  logoPath: string,
): string | undefined {
  if (
    !THEME_MODES.some((known) => known === mode) ||
    !PUBLIC_PATH.test(logoPath)
  ) {
    return `${slot} ${mode} is not a public path such as /branding/logo.svg`;
  }
  return slotAccepts(slot, logoPath.split(".").pop() ?? "")
    ? undefined
    : `${slot} ${mode} must be a PNG or a JPEG, such as /branding/logo.png: mail clients show no other image`;
}

/**
 * Issues for each unknown slot or mode, each value that is not a public path,
 * and each file type its slot refuses.
 */
export function validateLogos(logos: ThemeLogos): ValidationIssue[] {
  return Object.entries(logos).flatMap(([slot, pathsByMode]) => {
    const knownSlot = LOGO_SLOTS.find((candidate) => candidate === slot);
    if (!knownSlot) {
      return [
        { pointer: `/logos/${slot}`, message: `${slot} is not a logo slot` },
      ];
    }
    return Object.entries(pathsByMode ?? {}).flatMap(([mode, value]) => {
      const message = logoPathProblem(knownSlot, mode, value);
      return message ? [{ pointer: `/logos/${slot}/${mode}`, message }] : [];
    });
  });
}

/** Issues for each unknown role and each value that is not a palette name. */
export function validateColors(colors: ThemeColors): ValidationIssue[] {
  return Object.entries(colors).flatMap(([role, palette]) => {
    const pointer = `/colors/${role}`;
    if (!COLOR_ROLES.some((known) => known === role)) {
      return [{ pointer, message: `${role} is not a color role` }];
    }
    return isString(palette) && PALETTE_NAME.test(palette)
      ? []
      : [{ pointer, message: `${role} is not a palette name such as violet` }];
  });
}
