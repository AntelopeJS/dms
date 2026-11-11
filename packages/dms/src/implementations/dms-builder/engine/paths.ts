export interface ParsedBlockPath {
  pageRef: string;
  segments: string[];
}

export function parseBlockPath(path: string): ParsedBlockPath | undefined {
  const hash = path.indexOf("#");
  if (hash < 0) {
    return undefined;
  }
  const pageRef = path.slice(0, hash);
  const segments = path
    .slice(hash + 1)
    .split("/")
    .filter((segment) => segment.length > 0);
  if (!pageRef || segments.length === 0) {
    return undefined;
  }
  return { pageRef, segments };
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Whether a name can be emitted as a bare JS identifier rather than a string. */
export function isIdentifier(name: unknown): name is string {
  return typeof name === "string" && IDENTIFIER.test(name);
}

/**
 * An object literal's property name for `key`. `__proto__` is computed: bare or
 * quoted, it sets the object's prototype instead of defining a property.
 */
export function propertyKey(key: string): string {
  if (key === "__proto__") {
    return '["__proto__"]';
  }
  return IDENTIFIER.test(key) ? key : JSON.stringify(key);
}
