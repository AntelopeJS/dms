/** Whether `value` is an object other than `null`, whose own keys can be read. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
