import { InterfaceFunction } from "@antelopejs/interface-core";

/**
 * The public origin the dashboard is served from.
 *
 * It comes from the DMS configuration, and from the dev server override, so the
 * module owns it: anything building an absolute link -- an export mail, an
 * invitation -- asks for it rather than reading a value this package would have
 * to hold and every consumer would have to keep in sync.
 */
export const GetClientBaseUrl = InterfaceFunction<() => string | undefined>();
