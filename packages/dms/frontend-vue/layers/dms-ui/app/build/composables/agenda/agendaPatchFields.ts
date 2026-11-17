import type { JsonValue } from "../../../../../dms-core/app/types/json";
import type {
  AgendaEventData,
  AgendaEventPatch,
} from "../../../types/full-agenda";

/** A value a patch holds, `undefined` when it does not set it. */
export type AgendaPatchValue = JsonValue | undefined;

/** A field of an event a change sets, besides its `data`. */
export type AgendaPatchField = Exclude<keyof AgendaEventPatch, "data">;

type ClearableField = {
  [Key in AgendaPatchField]: null extends AgendaEventPatch[Key] ? Key : never;
}[AgendaPatchField];

/** Every field of an event a change sets, besides its `data`. */
export const PATCH_FIELDS: readonly AgendaPatchField[] = [
  "title",
  "start",
  "end",
  "allDay",
  "calendarId",
  "resourceIds",
  "location",
  "description",
];

const CLEARABLE_FIELDS: ReadonlySet<AgendaPatchField> = new Set<ClearableField>(
  ["end", "calendarId", "location", "description"],
);

const isClearable = (key: AgendaPatchField): key is ClearableField =>
  CLEARABLE_FIELDS.has(key);

/**
 * Sets `key` of `target` to its value in `source`, or clears it (`null`)
 * when `source` holds none and the field can be cleared.
 */
export function copyField<Key extends AgendaPatchField>(
  target: Pick<AgendaEventPatch, Key>,
  source: Pick<AgendaEventPatch, Key>,
  key: Key,
): void {
  const value = source[key];
  if (value !== undefined && value !== null) target[key] = value;
  else if (isClearable(key)) target[key] = null;
}

/** The value of a `data` key, `undefined` when the data does not hold it. */
export const dataValue = (
  data: AgendaEventData,
  key: string,
): AgendaPatchValue => (Object.hasOwn(data, key) ? data[key] : undefined);
