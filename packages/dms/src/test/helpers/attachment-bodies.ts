const MIB = 1024 * 1024;

/** An object that nests `levels` objects around `leaf`. */
function nestedObject(levels: number, leaf: string) {
  let value: string | object = leaf;
  for (let level = 0; level < levels; level += 1) value = { a: value };
  return value;
}

/**
 * The smallest array of nested objects whose JSON text reaches 1 MiB. The
 * array is the submitted field itself, so with the document the body nests
 * `levels + 2` levels.
 */
export function megabyteOfNestedObjects(levels: number) {
  const elements = [];
  let size = 2;
  while (size < MIB) {
    const element = nestedObject(levels, `k${elements.length}`);
    elements.push(element);
    size += JSON.stringify(element).length + 1;
  }
  return elements;
}

/** An array of `width` distinct strings, none of them a file reference. */
export function wideArray(width: number) {
  return Array.from({ length: width }, (_, index) => `k${index}`);
}

/** An object of `width` distinct entries whose values are strings. */
export function wideObject(width: number) {
  return Object.fromEntries(
    Array.from({ length: width }, (_, index) => [`p${index}`, `k${index}`]),
  );
}
