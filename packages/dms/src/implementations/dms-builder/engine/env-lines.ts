/** A name `.env` can assign, as Node's `loadEnvFile` and dotenv read one. */
export const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;
const QUOTES = new Set(['"', "'", "`"]);
const TRAILING_COMMENT = /\s+#.*$/;
const CARRIAGE_RETURN = "\r";

function withoutReturn(line: string): string {
  return line.endsWith(CARRIAGE_RETURN) ? line.slice(0, -1) : line;
}

function valueOf(raw: string): string {
  const quote = raw[0];
  if (quote !== undefined && QUOTES.has(quote)) {
    const end = raw.indexOf(quote, 1);
    if (end > 0) {
      return raw.slice(1, end);
    }
  }
  return raw.replace(TRAILING_COMMENT, "");
}

/** The name a `.env` line assigns, when it assigns one. */
export function assignedName(line: string): string | undefined {
  return ASSIGNMENT.exec(withoutReturn(line))?.[1];
}

function assigns(line: string, name: string): boolean {
  return assignedName(line) === name;
}

/**
 * The value `.env` text gives `name`, as Node's `loadEnvFile` and dotenv read it: `export ` and
 * spaces around `=` allowed, quotes taken off, an unquoted value's trailing comment left out, and
 * the last of several lines winning.
 */
export function envValue(text: string, name: string): string | undefined {
  let value: string | undefined;
  for (const line of text.split("\n")) {
    const match = ASSIGNMENT.exec(withoutReturn(line));
    if (match?.[1] === name) {
      value = valueOf(match[2] ?? "");
    }
  }
  return value;
}

/** The `.env` text with every line assigning `name` replaced by `line`, or `line` added at the end. */
export function withEnvLine(text: string, name: string, line: string): string {
  const lines = text.split("\n");
  let found = false;
  const replaced = lines.map((current) => {
    if (!assigns(current, name)) {
      return current;
    }
    found = true;
    return current.endsWith(CARRIAGE_RETURN)
      ? `${line}${CARRIAGE_RETURN}`
      : line;
  });
  if (found) {
    return replaced.join("\n");
  }
  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  return `${text}${separator}${line}\n`;
}

/** The `.env` text without the lines assigning `name`. */
export function withoutEnvLine(text: string, name: string): string {
  return text
    .split("\n")
    .filter((line) => !assigns(line, name))
    .join("\n");
}
