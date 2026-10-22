import {
  type AllowedOrigin,
  GetCorsConfig,
  SetCorsConfig,
} from "@antelopejs/interface-api";
import { getConfig } from "./config";

function listOrigins(
  allowedOrigins: AllowedOrigin | undefined,
): Array<string | RegExp> {
  return allowedOrigins === undefined ? [] : [allowedOrigins].flat();
}

/**
 * Lets the dashboard call the API cross-origin: adds its origin to the api
 * module's allowed CORS origins, next to the ones configured there.
 */
export async function allowClientOrigin(): Promise<void> {
  const origin = getConfig().clientBaseUrl;
  if (!origin) return;
  const cors = await GetCorsConfig();
  const origins = listOrigins(cors.allowedOrigins);
  if (origins.includes(origin)) return;
  await SetCorsConfig({ ...cors, allowedOrigins: [...origins, origin] });
}
