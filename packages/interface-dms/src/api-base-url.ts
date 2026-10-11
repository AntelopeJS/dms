import { InterfaceFunction } from "@antelopejs/interface-core";

/**
 * The public origin the DMS API is reached on (`apiBaseUrl`): the base of
 * any absolute link to a backend route -- a public file, a webhook, a
 * snippet a user copies.
 *
 * It comes from the DMS configuration, and from the dev server override, so
 * the module owns it, as with `GetClientBaseUrl`: behind a reverse proxy that
 * forwards no `X-Forwarded-Host`, the request alone cannot tell it.
 */
export const GetApiBaseUrl = InterfaceFunction<() => string | undefined>();
