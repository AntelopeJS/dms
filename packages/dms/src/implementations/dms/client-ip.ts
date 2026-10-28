import type { ClientAddressSource } from "@antelopejs/interface-dms/client-ip";
import { getAuthConfig } from "../../config";
import { resolveRequestClientIp } from "../../utils";

export function ResolveClientIp(source: ClientAddressSource): string {
  return resolveRequestClientIp(source, getAuthConfig());
}
