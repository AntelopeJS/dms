export function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
}

/** A relation name's singular, as class names take it: `accounts` → `account`. */
export function singular(name: string): string {
  if (name.endsWith("ies")) {
    return `${name.slice(0, -3)}y`;
  }
  if (/(ss|us|is)$/.test(name)) {
    return name;
  }
  return name.endsWith("s") ? name.slice(0, -1) : name;
}

/** A database name as a person reads it: `ordered_at` → `Ordered at`. */
export function humanized(name: string): string {
  const spaced = words(name).join(" ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
