import type {
  FormFieldOrGroup,
  FormSection,
  FormSectionNav,
} from "../../../composables/form/types/field";
import { isFieldGroup } from "../../../composables/form/types/field";

/** From this many sections, a form lists them beside them by default. */
const SIDE_NAV_MIN_SECTIONS = 3;

/** A section with the entries of the form it holds. */
export interface FormSectionLayout extends Omit<FormSection, "fieldIds"> {
  entries: FormFieldOrGroup[];
  /** Ids of the fields it holds, a group's fields included. */
  fieldIds: string[];
}

/** A sectioned form: the entries outside any section, then the sections. */
export interface FormSectionsLayout {
  lead: FormFieldOrGroup[];
  sections: FormSectionLayout[];
}

/** An error of the form, as UForm lists them: the name it went under. */
export interface FormErrorRef {
  name?: string;
}

/** What the navigation shows of a section. */
export interface FormSectionState {
  /** It holds an unsaved change. */
  dirty: boolean;
  /** How many of its fields hold an error. */
  invalidCount: number;
}

/** The navigation a sectioned form shows, declared or by its section count. */
export function resolveSectionNav(
  declared: FormSectionNav | undefined,
  sectionCount: number,
): FormSectionNav {
  if (declared) return declared;
  return sectionCount >= SIDE_NAV_MIN_SECTIONS ? "side" : "none";
}

/** The fields an entry holds: itself, or its group's fields. */
export function entryFieldIds(entry: FormFieldOrGroup): string[] {
  return isFieldGroup(entry)
    ? entry.fields.map((field) => field.id)
    : [entry.id];
}

/** Splits a form's entries between its sections, keeping their order. */
export function layoutSections(
  entries: readonly FormFieldOrGroup[],
  sections: readonly FormSection[],
): FormSectionsLayout {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const sectioned = new Set(sections.flatMap((section) => section.fieldIds));
  return {
    lead: entries.filter((entry) => !sectioned.has(entry.id)),
    sections: sections.map(({ fieldIds, ...section }) => {
      const held = fieldIds
        .map((id) => byId.get(id))
        .filter((entry): entry is FormFieldOrGroup => !!entry);
      return {
        ...section,
        entries: held,
        fieldIds: held.flatMap(entryFieldIds),
      };
    }),
  };
}

/**
 * The field an error belongs to: the one it names, or the one whose part it
 * names (`address.streetName`, `title.en`).
 */
export function errorFieldId(
  name: string | undefined,
  fieldIds: readonly string[],
): string | undefined {
  if (!name) return undefined;
  return fieldIds
    .filter((id) => name === id || name.startsWith(`${id}.`))
    .sort((left, right) => right.length - left.length)[0];
}

/** The fields holding an error, once each, in the form's order. */
export function invalidFieldIds(
  errors: readonly FormErrorRef[],
  fieldIds: readonly string[],
): string[] {
  const invalid = new Set(
    errors.map((error) => errorFieldId(error.name, fieldIds)),
  );
  return fieldIds.filter((id) => invalid.has(id));
}

/** Whether a section holds unsaved changes, and how many invalid fields. */
export function sectionState(
  section: Pick<FormSectionLayout, "fieldIds">,
  changed: ReadonlySet<string>,
  invalid: ReadonlySet<string>,
): FormSectionState {
  return {
    dirty: section.fieldIds.some((id) => changed.has(id)),
    invalidCount: section.fieldIds.filter((id) => invalid.has(id)).length,
  };
}
