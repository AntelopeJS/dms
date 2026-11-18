import type { JsonValue } from "../../../../dms-core/app/types/json";
import { isNumber, isString } from "../../../../dms-core/app/utils/type-check";
import { isObjectValue } from "./json";
import type { MockupSectionEdit } from "./mockupSections";

function isIndex(value: JsonValue | undefined): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isOptionalText(value: JsonValue | undefined): boolean {
  return value === undefined || isString(value);
}

/** Reads each kind of section edit a sidebar posts, every field checked. */
const SECTION_EDIT_PARSERS: Record<
  MockupSectionEdit["kind"],
  (fields: Record<string, JsonValue>) => MockupSectionEdit | undefined
> = {
  addCategory: ({ title }) =>
    isString(title) ? { kind: "addCategory", title } : undefined,
  updateCategory: ({ category, title, icon }) =>
    isString(category) && isOptionalText(title) && isOptionalText(icon)
      ? {
          kind: "updateCategory",
          category,
          ...(isString(title) && { title }),
          ...(isString(icon) && { icon }),
        }
      : undefined,
  removeCategory: ({ category }) =>
    isString(category) ? { kind: "removeCategory", category } : undefined,
  moveCategory: ({ category, to }) =>
    isString(category) && isIndex(to)
      ? { kind: "moveCategory", category, to }
      : undefined,
  movePageTo: ({ page, category, index }) =>
    isString(page) &&
    (category === null || isString(category)) &&
    isIndex(index)
      ? { kind: "movePageTo", page, category, index }
      : undefined,
};

function isSectionEditKind(kind: string): kind is MockupSectionEdit["kind"] {
  return Object.hasOwn(SECTION_EDIT_PARSERS, kind);
}

/** The section edit `value` holds, or undefined when it is not one. */
export function parseSectionEdit(
  value: JsonValue | undefined,
): MockupSectionEdit | undefined {
  if (!isObjectValue(value) || !isString(value.kind)) return undefined;
  const { kind } = value;
  return isSectionEditKind(kind)
    ? SECTION_EDIT_PARSERS[kind](value)
    : undefined;
}
