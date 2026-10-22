import type { ClientAddressSource } from "@antelopejs/interface-dms/client-ip";
import { getAuthConfig } from "../../config";
import { resolveRequestClientIp } from "../../routes/auth/client-ip";

export function ResolveClientIp(source: ClientAddressSource): string {
  return resolveRequestClientIp(source, getAuthConfig());
}
