import { publishApiBaseUrl } from "../helpers/http";

interface ApiEndpointConfig {
  apiBaseUrl: string;
}

/**
 * The harness points `apiBaseUrl` at `${@api.API_LOCAL_BASE_URL}`, so the
 * runtime only constructs this module once the api has reserved its port and
 * the value names the server the harness actually started.
 */
export function construct(config: ApiEndpointConfig): void {
  publishApiBaseUrl(config.apiBaseUrl);
}
