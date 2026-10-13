import type { ClientAddressSource } from "@antelopejs/interface-dms/client-ip";
import { getAuthConfig } from "../../config";
import {
  resolveClientIp,
  trustedProxyCount,
} from "../../routes/auth/client-ip";

export function ResolveClientIp(source: ClientAddressSource): string {
  return resolveClientIp(source, trustedProxyCount(getAuthConfig()));
}
