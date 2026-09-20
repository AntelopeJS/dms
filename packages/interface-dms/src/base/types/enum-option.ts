/**
 * An enum option as a page may carry it: the member, or the value it stands for.
 *
 * A page is a file a developer types as much as one the builder writes, and what
 * the builder writes is a literal — `"md"`, never `Size.medium`, since nothing
 * in a serialized option says which enum a value came from. TypeScript refuses a
 * plain string where a string enum is expected, so an option declared over one
 * accepts both spellings; the option's schema validates the value either way.
 */
export type EnumOption<T extends string> = T | `${T}`;
