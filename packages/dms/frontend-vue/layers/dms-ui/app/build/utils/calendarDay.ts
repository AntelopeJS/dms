import {
  CalendarDate,
  CalendarDateTime,
  ZonedDateTime,
  toCalendarDate,
} from "@internationalized/date";
import type { isString } from "../../../../dms-core/app/utils/type-check";

/**
 * The day a calendar value falls on: a `CalendarDate` as it is, the date part
 * of a `CalendarDateTime` or `ZonedDateTime`, and nothing for any other value.
 */
export function toCalendarDay(
  value: Parameters<typeof isString>[0],
): CalendarDate | undefined {
  if (value instanceof CalendarDate) return value;
  if (value instanceof CalendarDateTime || value instanceof ZonedDateTime) {
    return toCalendarDate(value);
  }
  return undefined;
}
