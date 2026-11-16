import fc from "fast-check";

/** Where a constant of a generated app config is declared. */
export type Scope = "config" | "logos";

/**
 * One way a string is written in an app config: a literal, a constant that
 * holds a spelling, or a template literal, `+` chain, `.concat()` or
 * `[...].join()` of spellings.
 */
export type Spelling =
  | { kind: "text"; text: string; quote: number }
  | { kind: "constant"; scope: Scope; inner: Spelling }
  | { kind: "template"; parts: Spelling[] }
  | { kind: "plus"; parts: Spelling[] }
  | { kind: "concat"; parts: Spelling[] }
  | { kind: "join"; parts: Spelling[]; separator: string };

const QUOTES = ['"', "'", "`"] as const;
const MAX_DEPTH = 3;
const MAX_PARTS = 4;

/** A string literal as the whole value of a key, which a save rewrites. */
const BARE_LITERAL = /^(?:"[^"]*"|'[^']*'|`[^`$]*`)$/;

/** How the app config imports the constants of the `logos` file. */
export const IMPORT_SPECIFIERS = [
  "~/brand/logos",
  "@/brand/logos",
  "./brand/logos",
  "~/brand/paths",
] as const;

/** A generated app config and the string its slot evaluates to. */
export interface GeneratedConfig {
  source: string;
  logosSource: string;
  pathsSource: string;
  value: string;
}

/**
 * What the saved app config can build for `spelling`: the text each form
 * joins, as JavaScript evaluates it.
 */
export function evaluate(spelling: Spelling): string {
  switch (spelling.kind) {
    case "text":
      return spelling.text;
    case "constant":
      return evaluate(spelling.inner);
    case "join":
      return spelling.parts.map(evaluate).join(spelling.separator);
    default:
      return spelling.parts.map(evaluate).join("");
  }
}

function quoted(text: string, quote: number): string {
  const mark = QUOTES[quote % QUOTES.length] ?? '"';
  return mark === "`" ? `\`${text}\`` : `${mark}${text}${mark}`;
}

/** Where `text` may be cut: not inside a percent escape such as `%2F`. */
function isCutPoint(text: string, point: number): boolean {
  return text[point - 1] !== "%" && text[point - 2] !== "%";
}

function splitAt(text: string, cuts: number[]): string[] {
  const inside = text.length - 1;
  const points = [...new Set(cuts.map((cut) => 1 + (cut % inside)))]
    .filter((point) => isCutPoint(text, point))
    .sort((a, b) => a - b);
  const parts: string[] = [];
  let start = 0;
  for (const point of [...points, text.length]) {
    parts.push(text.slice(start, point));
    start = point;
  }
  return parts;
}

/** A runtime value of the config: it holds no character a file name cannot hold, unless it holds the whole file name. */
function isFileNameSafe(value: string, fileName: string): boolean {
  return /^[\w.-]*$/.test(value) || value.includes(fileName);
}

function operations(
  text: string,
  depth: number,
  fileName: string,
): fc.Arbitrary<Spelling> {
  const cuts = fc.array(fc.nat(), { minLength: 1, maxLength: MAX_PARTS - 1 });
  const operands = cuts.chain((points) =>
    fc.tuple(
      ...splitAt(text, points).map((part) => spell(part, depth - 1, fileName)),
    ),
  );
  const anchored = (parts: Spelling[], separator: string): boolean =>
    separator !== "" ||
    parts.every(
      (part, index) =>
        part.kind === "text" ||
        index === parts.length - 1 ||
        parts[index + 1]?.kind === "text",
    );
  const substituted = operands.filter(
    (parts) =>
      parts.every(
        (part) =>
          part.kind === "text" ||
          (part.kind === "constant" &&
            isFileNameSafe(evaluate(part), fileName)),
      ) && anchored(parts, ""),
  );
  const chained = operands.filter((parts) => anchored(parts, ""));
  const joined = fc
    .constantFrom("-", "/", "")
    .chain((separator) =>
      fc.tuple(
        fc.constant(separator),
        fc.tuple(
          ...(separator === ""
            ? splitAt(text, [1, 5])
            : text.split(separator)
          ).map((part) => spell(part, depth - 1, fileName)),
        ),
      ),
    )
    .filter(([separator, parts]) => anchored(parts, separator))
    .map(([separator, parts]) => ({
      kind: "join" as const,
      parts,
      separator,
    }));
  return fc.oneof(
    substituted.map((parts) => ({ kind: "template" as const, parts })),
    chained.map((parts) => ({ kind: "plus" as const, parts })),
    chained.map((parts) => ({ kind: "concat" as const, parts })),
    joined,
  );
}

/** Every spelling of `text` at most `depth` constants and operations deep. */
function spell(
  text: string,
  depth: number,
  fileName: string,
): fc.Arbitrary<Spelling> {
  const literal = fc
    .nat()
    .map((quote) => ({ kind: "text" as const, text, quote }));
  if (depth <= 0 || text.length < 2) {
    return literal;
  }
  const constant = fc
    .tuple(
      fc.constantFrom<Scope>("config", "logos"),
      spell(text, depth - 1, fileName),
    )
    .map(([scope, inner]) => ({ kind: "constant" as const, scope, inner }));
  return fc.oneof(
    { weight: 2, arbitrary: literal },
    ...(isFileNameSafe(text, fileName)
      ? [{ weight: 2, arbitrary: constant }]
      : []),
    { weight: 5, arbitrary: operations(text, depth, fileName) },
  );
}

/**
 * A string that reaches a builder-named logo file: the path itself, with a
 * query or a fragment, or inside an optimizer URL, percent-encoded or not.
 */
export function targetStrings(publicPath: string): fc.Arbitrary<string> {
  return fc.constantFrom(
    publicPath,
    `${publicPath}?v=3`,
    `${publicPath}#/a/3`,
    `/_vercel/image?url=${publicPath}&w=64`,
    `/_vercel/image?url=${encodeURIComponent(publicPath)}&w=64`,
    `https://cdn.example.com${publicPath}`,
  );
}

/** A spelling of any string `targetStrings` yields for `publicPath`. */
export function spellings(publicPath: string): fc.Arbitrary<Spelling> {
  const fileName = publicPath.slice(publicPath.lastIndexOf("/") + 1);
  return targetStrings(publicPath).chain((target) =>
    spell(target, MAX_DEPTH, fileName),
  );
}

function render(
  spelling: Spelling,
  scope: Scope,
  declarations: Record<Scope, string[]>,
  names: { next: number },
): string {
  switch (spelling.kind) {
    case "text":
      return quoted(spelling.text, spelling.quote);
    case "constant": {
      const owner = scope === "logos" ? "logos" : spelling.scope;
      const expression = render(spelling.inner, owner, declarations, names);
      const name = `LOGO_PART_${names.next}`;
      names.next += 1;
      declarations[owner].push(
        owner === "logos"
          ? `export const ${name} = ${expression};`
          : `const ${name} = ${expression};`,
      );
      return name;
    }
    case "template": {
      const body = spelling.parts
        .map((part) =>
          part.kind === "text" && !/[`$\\]/.test(part.text)
            ? part.text
            : `\${${render(part, scope, declarations, names)}}`,
        )
        .join("");
      return body.includes("${") ? `\`${body}\`` : quoted(body, 0);
    }
    case "plus":
      return spelling.parts
        .map((part) => render(part, scope, declarations, names))
        .join(" + ");
    case "concat": {
      const [head, ...rest] = spelling.parts.map((part) =>
        part.kind === "plus"
          ? `(${render(part, scope, declarations, names)})`
          : render(part, scope, declarations, names),
      );
      return `${head}.concat(${rest.join(", ")})`;
    }
    case "join": {
      const items = spelling.parts.map((part) =>
        render(part, scope, declarations, names),
      );
      return `[${items.join(", ")}].join(${quoted(spelling.separator, 0)})`;
    }
  }
}

function constantNames(declarations: string[]): string[] {
  return declarations.flatMap((line) => /const (\w+) =/.exec(line)?.[1] ?? []);
}

/**
 * The app config, and the two files it imports from, that spell `spelling` in
 * `email.light`, with the logo the draft will drop still in `default.light`.
 * A top-level literal would be rewritten by the save, so it is held in a
 * constant.
 */
export function appConfigFor(
  spelling: Spelling,
  publicPath: string,
  specifier: string,
): GeneratedConfig {
  const declarations: Record<Scope, string[]> = { config: [], logos: [] };
  const names = { next: 0 };
  const written = render(spelling, "config", declarations, names);
  const expression = BARE_LITERAL.test(written)
    ? render(
        { kind: "constant", scope: "config", inner: spelling },
        "config",
        declarations,
        names,
      )
    : written;
  const imported = constantNames(declarations.logos);
  const source = [
    imported.length > 0
      ? `import { ${imported.join(", ")} } from "${specifier}";`
      : "",
    ...declarations.config,
    "export default defineDmsAppConfig({",
    `  branding: { logo: { default: { light: "${publicPath}" }, email: { light: ${expression} } } },`,
    "});",
    "",
  ].join("\n");
  return {
    source,
    logosSource: `${declarations.logos.join("\n")}\n`,
    pathsSource: 'export * from "./logos";\n',
    value: evaluate(spelling),
  };
}

/**
 * Whether the string, as a browser or an image optimizer reads it, names the
 * file: spelled out or percent-encoded.
 */
export function namesFile(value: string, fileName: string): boolean {
  return (
    value.includes(fileName) || decodeURIComponent(value).includes(fileName)
  );
}
