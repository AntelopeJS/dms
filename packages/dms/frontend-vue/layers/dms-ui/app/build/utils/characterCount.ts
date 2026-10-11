/**
 * The counter a text field shows under `showCount`: the characters typed,
 * out of `maxLength` when the field has one ("4 / 60").
 */
export function characterCountText(value: unknown, maxLength?: number): string {
  const count = typeof value === "string" ? [...value].length : 0;
  return maxLength === undefined ? String(count) : `${count} / ${maxLength}`;
}
