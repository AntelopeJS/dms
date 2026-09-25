import { randomUUID } from "node:crypto";
import { sign } from "jsonwebtoken";
import { MILLISECONDS_PER_SECOND } from "@antelopejs/interface-dms/utils/time";
import { getHtmlRenderConfig } from "../../config";
import { HTML_RENDER_NAMESPACE } from "./constants";

export function generateServiceToken(): string {
  const config = getHtmlRenderConfig();
  // The lifetime is configured in milliseconds like every other DMS lifetime,
  // but jsonwebtoken reads a numeric expiresIn as seconds.
  const expiresInSeconds = Math.floor(
    config.serviceTokenLifetime / MILLISECONDS_PER_SECOND,
  );

  return sign(
    { namespace: HTML_RENDER_NAMESPACE, purpose: "html-render" },
    config.serviceSecret,
    {
      audience: "dms-frontend",
      expiresIn: expiresInSeconds,
      jwtid: randomUUID(),
    },
  );
}
