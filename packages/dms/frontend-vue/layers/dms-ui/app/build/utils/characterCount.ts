import { isString } from "../../../../dms-core/app/utils/type-check";

/**
 * The counter a text field shows under `showCount`: the characters typed,
 * out of `maxLength` when the field has one ("4 / 60").
 */
export function characterCountText(
  value: Parameters<typeof isString>[0],
  maxLength?: number,
): string {
  const count = isString(value) ? [...value].length : 0;
  return maxLength === undefined ? String(count) : `${count} / ${maxLength}`;
}
