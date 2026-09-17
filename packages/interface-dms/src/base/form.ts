// The public home of the form surface. The declaration is split in two so the
// schema builders can depend on the field shapes without the two files
// depending on each other: `form-types.ts` holds the props, the field and group
// shapes and the event/function name constants, `form-schema.ts` holds the
// `Form` builder and the Zod/JSON-schema helpers built on top of them. Both
// halves are one contract, so `@antelopejs/interface-dms/base/form` exposes
// them together.
export * from "./form-schema";
export * from "./form-types";
